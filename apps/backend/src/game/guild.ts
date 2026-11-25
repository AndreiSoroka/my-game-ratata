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
import {
    availableGuildDefinitions,
    viewActiveGuildJob,
    viewGuildHistory,
} from './guildViews'
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

    public definitions(leaderId: string, key: string) {
        return availableGuildDefinitions(
            [...guildQuests, ...(this.workers?.list() ?? [])],
            this.completed.get(leaderId),
            new Set(this.activeJobs(key).map((job) => job.definition.id))
        )
    }

    public contactAllowed(
        key: string,
        actor: GameCharacter,
        npc: GameCharacter,
        now: number,
        questId?: string,
        instanceId?: string
    ): boolean {
        const dynamicId = this.workers
            ?.list()
            .find((entry) => entry.id === questId)?.id
        const job =
            instanceId === undefined ? undefined : this.job(key, instanceId)
        if (
            instanceId !== undefined &&
            (job === undefined ||
                (job.issuerId !== undefined && job.issuerId !== npc.id))
        ) {
            return false
        }
        return workerContactAllowed(this.workers, job, {
            groupKey: key,
            requestId: dynamicId,
            actor,
            npc,
            now,
        })
    }

    private job(key: string, id: string): GuildJob | undefined {
        return this.slots.owns(key, id) ? this.jobs.get(id) : undefined
    }

    private readonly activeJobs = (key: string): GuildJob[] =>
        [...this.slots.idsFor(key)].flatMap((id) => {
            const job = this.jobs.get(id)
            return job === undefined ? [] : [job]
        })

    public snapshots(key: string): GuildQuestSnapshot[] {
        return this.activeJobs(key).flatMap((job) => {
            const view = viewActiveGuildJob(
                job,
                key,
                this.workers,
                this.rewards?.funding
            )
            return view === undefined ? [] : [view]
        })
    }

    public conversation(
        issuerId: string,
        personId: string,
        key: string
    ): GuildQuestSnapshot[] {
        return viewGuildHistory(
            this.history.values(),
            this.slots.idsFor(key),
            issuerId,
            personId,
            this.rewards?.funding
        )
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
        issuerId?: string,
        reporter?: GameCharacter
    ): { instanceId?: string; notice: string } {
        this.lifecycle.reconcile(key)
        if (this.activeJobs(key).some((job) => job.definition.id === questId)) {
            return { notice: 'Группа уже выполняет этот договор.' }
        }
        const definition = this.definitions(leader, key).find(
            (quest) => quest.id === questId
        )
        if (definition === undefined) {
            return {
                notice: 'Этот договор уже выполнен этой личностью или недоступен.',
            }
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
            reporter,
        })
        if (typeof job === 'string') {
            return { notice: job }
        }
        this.jobs.set(id, job)
        this.lifecycle.watchIssuer(job, now)
        this.history.set(id, job)
        if (reporter !== undefined) {
            this.lifecycle.reconcile(key)
        }
        return {
            instanceId: id,
            notice:
                reporter === undefined
                    ? 'Договор принят. Способ распределения награды закреплён; состав для выплаты определяется при сдаче.'
                    : 'Доклад принят. Работник проверит участок и вернётся к распорядителю.',
        }
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
    }

    public hasActiveJob(key: string): boolean {
        return this.slots.idsFor(key).size > 0
    }

    public refreshGroup(key: string, members: ReadonlySet<string>): void {
        this.workers?.refreshGroup?.(key, members)
    }

    public addLateMember(key: string, character: GameCharacter): void {
        for (const job of this.activeJobs(key)) {
            addGuildParticipant(job, character)
        }
    }

    public removeMember(key: string, playerId: string): void {
        for (const job of this.activeJobs(key)) {
            removeGuildParticipant(job, playerId)
        }
    }

    public observe(
        events: GameEventPayload[],
        find: (id: string) => GameCharacter | undefined,
        group: (id: string) => { key: string; members: Set<string> }
    ): void {
        this.killCredit.observe(events, find, group, this.activeJobs)
    }

    public update(
        key: string,
        members: Set<string>,
        characters: Map<string, GameCharacter>
    ): void {
        this.refreshGroup(key, members)
        this.lifecycle.reconcile(key)
        for (const job of this.activeJobs(key)) {
            if (
                job.definition.id === 'survey_frontier' &&
                job.progress < job.definition.goal
            ) {
                advanceExploration(job, members, characters)
            }
        }
    }

    public report(
        key: string,
        instanceId: string,
        actor: GameCharacter,
        now: number
    ): string {
        const job = this.job(key, instanceId)
        if (job?.definition.workRequest === undefined) {
            return 'Это обращение уже недоступно.'
        }
        const error = this.workers?.report(job.definition.id, key, actor, now)
        return error === null
            ? 'Доклад принят. Работник проверит участок и вернётся к распорядителю.'
            : (error ?? 'Обращение недоступно.')
    }

    public abandon(key: string, instanceId: string, now: number): string {
        const job = this.job(key, instanceId)
        if (job === undefined) {
            return 'Этот договор уже недоступен.'
        }
        if (job.definition.workRequest !== undefined) {
            const error = this.workers?.abandon(job.definition.id, key, now)
            if (error !== null) {
                return error ?? 'Обращение недоступно.'
            }
        }
        this.lifecycle.drop(job, 'Договор оставлен. Награда освобождена.')
        return 'Договор оставлен. Награда не выдана.'
    }

    public release(key: string, now: number): void {
        this.lifecycle.release(key, now)
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
        const job = this.job(key, instanceId)
        if (job === undefined) {
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
        this.lifecycle.remove(job)
        if (job.definition.workRequest === undefined) {
            const completed =
                this.completed.get(job.acceptedBy) ?? new Set<string>()
            completed.add(job.definition.id)
            this.completed.set(job.acceptedBy, completed)
        }
        return `Договор закрыт. Общая награда: ${String(job.definition.rewardGold)} золотых.`
    }
}
