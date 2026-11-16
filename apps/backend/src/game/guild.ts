import type {
    GameEventPayload,
    GuildQuestSnapshot,
    QuestRewardMode,
} from '@my-game-ratata/contracts'
import { DEFAULT_QUEST_REWARD_MODE } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { GuildKillCredit } from './guildKillCredit'
import {
    advanceExploration,
    createGuildParticipants,
    type GuildJob,
    guildQuests,
    rewardEligible,
} from './guildRules'
import {
    acceptWorkerJob,
    checkWorkerTurnIn,
    refreshWorkerJob,
    workerContactAllowed,
    type WorkerGuildGateway,
} from './guildWorkerRequests'
import { resetMartyrStreak } from './martyr'
import type { QuestGoldAwarder } from './questRewards'
export { guildQuests } from './guildRules'
export type { WorkerGuildGateway } from './guildWorkerRequests'

export class GuildService {
    private readonly jobs = new Map<string, GuildJob>()
    private readonly completed = new Map<string, Set<string>>()
    private readonly killCredit = new GuildKillCredit()
    private nextJob = 1

    public constructor(private readonly workers?: WorkerGuildGateway) {}

    public definitions() {
        return [...guildQuests, ...(this.workers?.list() ?? [])]
    }

    public contactAllowed(
        key: string,
        actor: GameCharacter,
        npc: GameCharacter,
        now: number,
        questId?: string
    ): boolean {
        const dynamicId = this.workers
            ?.list()
            .find((entry) => entry.id === questId)?.id
        return workerContactAllowed(this.workers, this.jobs.get(key), {
            groupKey: key,
            requestId: dynamicId,
            actor,
            npc,
            now,
        })
    }

    public snapshot(key: string): GuildQuestSnapshot | null {
        const job = this.jobs.get(key)
        if (job === undefined || !refreshWorkerJob(this.workers, job, key)) {
            this.jobs.delete(key)
            return null
        }
        return {
            ...job.definition,
            instanceId: job.id,
            rewardMode: job.rewardMode,
            ...(job.rewardShares === undefined
                ? {}
                : { rewardShares: job.rewardShares }),
            participants: [...job.participants].map(([id, entry]) => ({
                id,
                nickname: entry.nickname,
                contribution: entry.contribution,
                eligible: entry.eligible,
            })),
            progress: job.progress,
            status: job.completed
                ? 'completed'
                : job.progress >= job.definition.goal
                  ? 'ready'
                  : 'active',
        }
    }

    public accept(
        key: string,
        questId: string,
        leader: string,
        members: Set<string>,
        characters: Map<string, GameCharacter>,
        rewardMode: QuestRewardMode = DEFAULT_QUEST_REWARD_MODE,
        now = 0
    ): string {
        this.snapshot(key)
        const current = this.jobs.get(key)
        if (current !== undefined && !current.completed) {
            return 'Сначала завершите действующий договор.'
        }
        const definition = this.definitions().find(
            (quest) => quest.id === questId
        )
        if (
            definition === undefined ||
            (definition.workRequest === undefined &&
                this.completed.get(leader)?.has(questId) === true)
        ) {
            return 'Этот договор уже выполнен этой личностью или недоступен.'
        }
        const error = acceptWorkerJob(
            this.workers,
            definition,
            key,
            members,
            characters,
            now
        )
        if (error !== null) {
            return error
        }
        const participants = createGuildParticipants(members, characters)
        this.jobs.set(key, {
            acceptedBy: leader,
            completed: false,
            definition,
            rewardMode,
            id: `guild-contract-${String(this.nextJob++)}`,
            participants,
            progress: 0,
            visited: new Set(),
        })
        return 'Договор принят. Способ распределения награды закреплён; состав для выплаты определяется при сдаче.'
    }

    public moveJob(from: string, to: string): void {
        this.workers?.moveGroup(from, to)
        const job = this.jobs.get(from)
        if (job !== undefined) {
            this.jobs.set(to, job)
            this.jobs.delete(from)
        }
    }

    public hasActiveJob(key: string): boolean {
        const snapshot = this.snapshot(key)
        return snapshot !== null && snapshot.status !== 'completed'
    }

    public refreshGroup(key: string, members: ReadonlySet<string>): void {
        this.workers?.refreshGroup?.(key, members)
    }

    public addLateMember(key: string, character: GameCharacter): void {
        const job = this.jobs.get(key)
        if (job?.participants.has(character.id) === true) {
            const entry = job.participants.get(character.id)
            if (entry !== undefined) {
                entry.eligible = true
            }
        }
        if (job !== undefined && !job.participants.has(character.id)) {
            job.participants.set(character.id, {
                nickname: character.nickname,
                contribution: 0,
                eligible: true,
                visited: new Set(),
            })
        }
    }

    public removeMember(key: string, playerId: string): void {
        const participant = this.jobs.get(key)?.participants.get(playerId)
        if (participant !== undefined) {
            participant.eligible = false
        }
    }

    public observe(
        events: GameEventPayload[],
        find: (id: string) => GameCharacter | undefined,
        group: (id: string) => { key: string; members: Set<string> }
    ): void {
        this.killCredit.observe(events, find, group, this.jobs)
    }

    public update(
        key: string,
        members: Set<string>,
        characters: Map<string, GameCharacter>
    ): void {
        this.refreshGroup(key, members)
        const job = this.jobs.get(key)
        if (job !== undefined && !refreshWorkerJob(this.workers, job, key)) {
            this.jobs.delete(key)
            return
        }
        if (
            job === undefined ||
            job.completed ||
            job.definition.id !== 'survey_frontier' ||
            job.progress >= job.definition.goal
        ) {
            return
        }
        advanceExploration(job, members, characters)
    }

    public report(
        key: string,
        instanceId: string,
        actor: GameCharacter,
        now: number
    ): string {
        const job = this.jobs.get(key)
        if (
            job === undefined ||
            job.completed ||
            job.id !== instanceId ||
            job.definition.workRequest === undefined
        ) {
            return 'Это обращение уже недоступно.'
        }
        const error = this.workers?.report(job.definition.id, key, actor, now)
        return error === null
            ? 'Доклад принят. Работник проверит участок и вернётся к распорядителю.'
            : (error ?? 'Обращение недоступно.')
    }

    public abandon(key: string, instanceId: string, now: number): string {
        const job = this.jobs.get(key)
        if (job === undefined || job.completed || job.id !== instanceId) {
            return 'Этот договор уже недоступен.'
        }
        if (job.definition.workRequest !== undefined) {
            const error = this.workers?.abandon(job.definition.id, key, now)
            if (error !== null) {
                return error ?? 'Обращение недоступно.'
            }
        }
        this.jobs.delete(key)
        return 'Договор оставлен. Награда не выдана.'
    }

    public release(key: string, now: number): void {
        this.workers?.releaseGroup(key, now)
        this.jobs.delete(key)
    }

    public turnIn(
        key: string,
        instanceId: string,
        submitterId: string,
        members: Set<string>,
        characters: Map<string, GameCharacter>,
        award: QuestGoldAwarder,
        now: number
    ): string {
        const job = this.jobs.get(key)
        if (job === undefined || job.completed || job.id !== instanceId) {
            return 'Нет готового неоплаченного договора.'
        }
        if (
            !refreshWorkerJob(this.workers, job, key) ||
            job.progress < job.definition.goal
        ) {
            return 'Условия договора ещё не выполнены.'
        }
        const error = checkWorkerTurnIn(this.workers, job, key, now)
        if (error !== null) {
            return error
        }
        const result = award({
            receiptId: job.id,
            totalGold: job.definition.rewardGold,
            mode: job.rewardMode,
            submitterId,
            memberIds: [...members].filter((id) =>
                rewardEligible(id, members, characters.get(id))
            ),
        })
        if (!result.ok) {
            return 'Казначейство не подтвердило выплату. Попробуйте ещё раз.'
        }
        job.rewardShares = result.shares
        const submitter = characters.get(submitterId)
        if (submitter !== undefined) {
            resetMartyrStreak(submitter)
        }
        job.completed = true
        if (job.definition.workRequest !== undefined) {
            this.workers?.complete(job.definition.id, key)
            job.definition = {
                ...job.definition,
                workRequest: {
                    ...job.definition.workRequest,
                    stage: 'completed',
                },
            }
        } else {
            const completed =
                this.completed.get(job.acceptedBy) ?? new Set<string>()
            completed.add(job.definition.id)
            this.completed.set(job.acceptedBy, completed)
        }
        return `Договор закрыт. Общая награда: ${String(job.definition.rewardGold)} золотых.`
    }
}
