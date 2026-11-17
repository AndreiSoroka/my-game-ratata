import type {
    GameEventPayload,
    GuildQuestSnapshot,
    QuestRewardMode,
} from '@my-game-ratata/contracts'
import { DEFAULT_QUEST_REWARD_MODE } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { ContractSlots } from './contractSlots'
import { acceptGuildJob } from './guildAcceptance'
import { GuildJobLifecycle } from './guildJobLifecycle'
import { GuildKillCredit } from './guildKillCredit'
import type {
    GuildRewardEnvironment,
    NegotiatedWorkerReward,
} from './guildRewards'
import {
    addGuildParticipant,
    advanceExploration,
    type GuildJob,
    guildQuests,
    removeGuildParticipant,
} from './guildRules'
import { settleGuildJob } from './guildSettlement'
import { viewGuildJob } from './guildViews'
import {
    workerContactAllowed,
    type WorkerGuildGateway,
} from './guildWorkerRequests'
import type { QuestGoldAwarder } from './questRewards'
export type { NegotiatedWorkerReward } from './guildRewards'
export type { GuildRewardEnvironment } from './guildRewards'
export { guildQuests } from './guildRules'
export type { WorkerGuildGateway } from './guildWorkerRequests'

export class GuildService {
    private readonly jobs = new Map<string, GuildJob>()
    private readonly completed = new Map<string, Set<string>>()
    private readonly killCredit = new GuildKillCredit()
    private readonly history = new Map<string, GuildJob>()
    private nextJob = 1
    private readonly lifecycle: GuildJobLifecycle

    public constructor(
        private readonly workers?: WorkerGuildGateway,
        private readonly slots = new ContractSlots(),
        private readonly rewards?: GuildRewardEnvironment
    ) {
        this.lifecycle = new GuildJobLifecycle(
            this.jobs,
            this.slots,
            this.workers,
            this.rewards
        )
    }

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
        if (job === undefined) {
            return null
        }
        if (job.definition.workRequest === undefined || job.completed) {
            return viewGuildJob(job, this.rewards?.funding)
        }
        const request = this.workers?.active(key)
        return request?.id !== job.definition.id
            ? null
            : viewGuildJob(
                  {
                      ...job,
                      definition: { ...job.definition, workRequest: request },
                      progress:
                          request.stage === 'ready' ? job.definition.goal : 0,
                  },
                  this.rewards?.funding
              )
    }

    public conversation(
        issuerId: string,
        personId: string
    ): GuildQuestSnapshot[] {
        return [...this.history.values()]
            .filter(
                (job) =>
                    (issuerId === '' || job.issuerId === issuerId) &&
                    (job.acceptedBy === personId ||
                        job.participants.has(personId))
            )
            .map((job) => viewGuildJob(job, this.rewards?.funding))
    }

    public accept(
        key: string,
        questId: string,
        leader: string,
        members: Set<string>,
        characters: Map<string, GameCharacter>,
        rewardMode: QuestRewardMode = DEFAULT_QUEST_REWARD_MODE,
        now = 0,
        terms?: NegotiatedWorkerReward,
        issuerId?: string
    ): string {
        this.lifecycle.reconcile(key)
        const current = this.jobs.get(key)
        if (
            (current !== undefined && !current.completed) ||
            this.slots.get(key) !== undefined
        ) {
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
        const id = this.newInstanceId()
        const job = acceptGuildJob({
            key,
            id,
            definition,
            leader,
            members,
            characters,
            rewardMode,
            now,
            terms,
            issuerId,
            rewards: this.rewards,
            workers: this.workers,
            slots: this.slots,
        })
        if (typeof job === 'string') {
            return job
        }
        this.lifecycle.watchIssuer(job, now)
        this.jobs.set(key, job)
        this.history.set(id, job)
        return 'Договор принят. Способ распределения награды закреплён; состав для выплаты определяется при сдаче.'
    }

    private newInstanceId(): string {
        return (
            this.rewards?.funding.newId('guild-contract') ??
            `guild-contract-${String(this.nextJob++)}`
        )
    }

    public moveJob(from: string, to: string): void {
        this.slots.move(from, to)
        this.workers?.moveGroup(from, to)
        const job = this.jobs.get(from)
        if (job !== undefined) {
            this.jobs.set(to, job)
            this.jobs.delete(from)
        }
    }

    public hasActiveJob(key: string): boolean {
        const snapshot = this.snapshot(key)
        return (
            this.slots.get(key) !== undefined ||
            (snapshot !== null && snapshot.status !== 'completed')
        )
    }

    public refreshGroup(key: string, members: ReadonlySet<string>): void {
        this.workers?.refreshGroup?.(key, members)
    }

    public addLateMember(key: string, character: GameCharacter): void {
        addGuildParticipant(this.jobs.get(key), character)
    }

    public removeMember(key: string, playerId: string): void {
        removeGuildParticipant(this.jobs.get(key), playerId)
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
        this.lifecycle.reconcile(key)
        const job = this.jobs.get(key)
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
        this.lifecycle.drop(key, 'Договор оставлен. Награда освобождена.')
        return 'Договор оставлен. Награда не выдана.'
    }

    public release(key: string, now: number): void {
        this.workers?.releaseGroup(key, now)
        this.lifecycle.drop(key, 'Группа больше не выполняет договор.')
    }

    public readonly stop = () => this.lifecycle.stop()

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
        const error = settleGuildJob({
            job,
            key,
            submitterId,
            members,
            characters,
            award,
            now,
            rewards: this.rewards,
            workers: this.workers,
        })
        if (error !== null) {
            return error
        }
        this.slots.release(job.id)
        if (job.definition.workRequest === undefined) {
            const completed =
                this.completed.get(job.acceptedBy) ?? new Set<string>()
            completed.add(job.definition.id)
            this.completed.set(job.acceptedBy, completed)
        }
        return `Договор закрыт. Общая награда: ${String(job.definition.rewardGold)} золотых.`
    }
}
