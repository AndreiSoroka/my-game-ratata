import {
    type GameEventPayload,
    type NpcQuestClientMessage,
    type NpcQuestDecision,
    type NpcQuestSocialSnapshot,
    type QuestDraft,
    type QuestHistoryEntry,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { answerQuestOffer } from './npcQuestAcceptance'
import { inquireNpcQuest } from './npcQuestInquiry'
import { recordNpcQuest, recordQuestOffer } from './npcQuestJournal'
import { NpcQuestLifecycle } from './npcQuestLifecycle'
import {
    NpcQuestOfferOperations,
    questRewardWallet,
} from './npcQuestOfferOperations'
import { inspectQuest, observeQuestDeath } from './npcQuestProgress'
import { snapshotNpcQuests } from './npcQuestSnapshots'
import { turnInNpcQuest } from './npcQuestTurnIn'
import {
    type NpcQuestEnvironment,
    type NpcQuestRecord,
    type NpcQuestResult,
    questOfferAvailable,
    type QuestOfferRecord,
} from './npcQuestTypes'
import { QuestJournal } from './questJournal'

export type { NpcQuestResult } from './npcQuestTypes'

/** Model prose proposes; only validated commands and resolved events change a contract. */
export class NpcQuestService {
    private readonly offers = new Map<string, QuestOfferRecord>()
    private readonly jobs = new Map<string, NpcQuestRecord>()
    public readonly journal = new QuestJournal()
    private readonly reservations: import('./rewardReservations').RewardReservations

    private readonly offerOperations: NpcQuestOfferOperations
    private readonly lifecycle: NpcQuestLifecycle
    public constructor(private readonly environment: NpcQuestEnvironment) {
        this.offerOperations = new NpcQuestOfferOperations({
            environment,
            offers: this.offers,
            journal: this.journal,
        })
        this.reservations = environment.adventure.questFunding.reservations
        this.lifecycle = new NpcQuestLifecycle(environment, this.reservations)
    }

    public readonly decide = this.handleDecision.bind(this)

    public stop(): void {
        for (const job of this.jobs.values()) {
            this.lifecycle.cancel(job, 'Мир остановлен. Договор отменён.')
        }
        this.offers.clear()
    }

    public handleDecision(
        issuer: GameCharacter,
        decision: NpcQuestDecision,
        now: number
    ): NpcQuestResult {
        switch (decision.type) {
            case 'quest_propose':
                return this.propose(
                    issuer,
                    decision.targetId,
                    decision.draft,
                    now
                )
            case 'worker_quest_propose':
                return this.workerPropose(
                    issuer,
                    decision.targetId,
                    decision.requestId,
                    now
                )
            case 'quest_offer_revise':
                return this.offerOperations.revise(issuer, decision, now)
            case 'quest_inquire':
                return this.inquire(
                    issuer,
                    decision.instanceId,
                    decision.objectiveIndex,
                    now
                )
            default:
                return this.result(
                    false,
                    'Это действие требует окна подтверждения разговора.'
                )
        }
    }

    public propose(
        issuer: GameCharacter,
        targetId: string,
        draft: QuestDraft,
        now: number
    ): NpcQuestResult {
        return this.offerOperations.propose(issuer, targetId, draft, now)
    }
    public workerPropose(
        issuer: GameCharacter,
        targetId: string,
        requestId: string,
        now: number
    ): NpcQuestResult {
        return this.offerOperations.workerPropose(
            issuer,
            targetId,
            requestId,
            now
        )
    }

    public handle(
        actor: GameCharacter,
        message: NpcQuestClientMessage,
        now: number
    ): NpcQuestResult {
        if (message.type === 'quest_offer_answer') {
            return this.answer(actor, message, now)
        }
        if (message.type === 'quest_inquire') {
            return this.inquire(
                actor,
                message.instanceId,
                message.objectiveIndex,
                now
            )
        }
        if (message.type === 'quest_turn_in_confirm') {
            return this.result(
                false,
                'Подтверждение доступно только через серверное окно сдачи.'
            )
        }
        const job = this.jobs.get(message.instanceId)
        const group = this.environment.parties.contractGroup(actor.id)
        if (group.leaderId !== actor.id) {
            return this.result(false, 'Договор принимает и сдаёт лидер группы.')
        }
        if (
            job === undefined ||
            (this.environment.parties.contractSlots.get(group.key) !==
                message.instanceId &&
                !terminalReceiptOwner(job, actor.id))
        ) {
            return this.result(false, 'Этот договор вам недоступен.')
        }
        if (message.type === 'npc_quest_abandon') {
            this.lifecycle.cancel(job, 'Договор оставлен. Награда освобождена.')
            this.recordJob(job, now)
            return this.result(true)
        }
        return turnInNpcQuest(
            {
                environment: this.environment,
                lifecycle: this.lifecycle,
                record: (entry, time) => this.recordJob(entry, time),
            },
            actor,
            job,
            now
        )
    }

    private answer(
        actor: GameCharacter,
        message: Extract<NpcQuestClientMessage, { type: 'quest_offer_answer' }>,
        now: number
    ): NpcQuestResult {
        const offer = this.offers.get(actor.id)
        const outcome = answerQuestOffer(
            {
                environment: this.environment,
                offers: this.offers,
                jobs: this.jobs,
                reservations: this.reservations,
                rewardWallet: (entry, issuer) =>
                    questRewardWallet(this.environment, entry, issuer),
                newId: (prefix) =>
                    this.environment.adventure.questFunding.newId(
                        `npc-${prefix}`
                    ),
                cancel: (job, notice) => this.lifecycle.cancel(job, notice),
                refresh: (job) => this.lifecycle.refresh(job),
            },
            actor,
            message,
            now
        )
        if (outcome.accepted && offer !== undefined) {
            if (!message.accept) {
                this.recordOffer(offer, 'declined', now)
            }
            for (const job of this.jobs.values()) {
                this.recordJob(job, now)
            }
        }
        return outcome
    }

    public snapshot(actorId: string, now = Date.now()): NpcQuestSocialSnapshot {
        return snapshotNpcQuests(actorId, now, {
            environment: this.environment,
            offers: this.offers,
            jobs: this.jobs,
        })
    }

    public update(now: number): void {
        for (const [id, offer] of this.offers) {
            if (!questOfferAvailable(offer, this.environment, now)) {
                this.recordOffer(
                    offer,
                    offer.view.expiresAt <= now ? 'expired' : 'cancelled',
                    now
                )
                this.offers.delete(id)
            }
        }
        for (const job of this.jobs.values()) {
            this.lifecycle.refresh(job)
            this.recordJob(job, now)
        }
    }

    public observe(events: GameEventPayload[]): void {
        for (const event of events) {
            for (const job of this.jobs.values()) {
                if (
                    event.kind === 'death' &&
                    event.targetId === job.view.issuerId
                ) {
                    this.lifecycle.cancel(
                        job,
                        'Заказчик погиб. Договор отменён; резерв освобождён.'
                    )
                }
                observeQuestDeath(job, event, this.environment)
            }
        }
    }

    public inspect(actorId: string, targetId: string, receiptId: string): void {
        for (const job of this.jobs.values()) {
            inspectQuest(job, actorId, targetId, receiptId, this.environment)
        }
    }

    public cityFund(cityId: string): number {
        return this.environment.adventure.questFunding.availableGold(cityId)
    }

    public conversation(issuerId: string, recipientId: string) {
        return [...this.jobs.values()]
            .filter(
                (job) =>
                    job.view.issuerId === issuerId &&
                    (job.acceptedBy === recipientId ||
                        job.submittedBy === recipientId ||
                        job.baseline.has(recipientId) ||
                        this.environment.parties
                            .contractRoster(job.view.instanceId)
                            .members.has(recipientId))
            )
            .map((job) => structuredClone(job.view))
    }

    public inquire(
        actor: GameCharacter,
        instanceId: string,
        objectiveIndex: number,
        now: number
    ): NpcQuestResult {
        return inquireNpcQuest(
            {
                environment: this.environment,
                jobs: this.jobs,
                refresh: (job) => this.lifecycle.refresh(job),
                record: (job, time) => this.recordJob(job, time),
            },
            actor,
            instanceId,
            objectiveIndex,
            now
        )
    }
    private recordOffer(
        offer: QuestOfferRecord,
        status: QuestHistoryEntry['status'],
        now: number
    ): void {
        recordQuestOffer(this.journal, offer, status, now)
    }
    private recordJob(job: NpcQuestRecord, now: number): void {
        recordNpcQuest(this.journal, job, this.environment, now)
    }

    private result(
        accepted: boolean,
        error: string | null = null
    ): NpcQuestResult {
        return { accepted, error, events: [] }
    }
}

function terminalReceiptOwner(job: NpcQuestRecord, actorId: string): boolean {
    return (
        ['completed', 'cancelled'].includes(job.view.status) &&
        (job.acceptedBy === actorId || job.submittedBy === actorId)
    )
}
