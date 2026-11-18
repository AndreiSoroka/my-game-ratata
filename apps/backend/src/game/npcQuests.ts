import {
    type GameEventPayload,
    type NpcQuestClientMessage,
    type NpcQuestDecision,
    type NpcQuestSocialSnapshot,
    type QuestDraft,
    type QuestOfferReplacement,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { answerQuestOffer } from './npcQuestAcceptance'
import { handleNpcQuestClient } from './npcQuestClientActions'
import { inquireNpcQuest } from './npcQuestInquiry'
import { NpcQuestInvitations } from './npcQuestInvitations'
import { recordNpcQuest, recordQuestOffer } from './npcQuestJournal'
import { NpcQuestLifecycle } from './npcQuestLifecycle'
import {
    NpcQuestOfferOperations,
    questRewardWallet,
} from './npcQuestOfferOperations'
import { inspectQuest, observeQuestDeath } from './npcQuestProgress'
import { conversationNpcQuests, snapshotNpcQuests } from './npcQuestSnapshots'
import {
    type NpcQuestDecisionContext,
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

    private readonly invitations: NpcQuestInvitations
    private readonly offerOperations: NpcQuestOfferOperations
    private readonly lifecycle: NpcQuestLifecycle
    public constructor(private readonly environment: NpcQuestEnvironment) {
        this.offerOperations = new NpcQuestOfferOperations({
            environment,
            offers: this.offers,
            journal: this.journal,
        })
        this.invitations = new NpcQuestInvitations(
            environment,
            this.offerOperations
        )
        this.reservations = environment.adventure.questFunding.reservations
        this.lifecycle = new NpcQuestLifecycle(environment, this.reservations)
    }

    public readonly decide = this.handleDecision.bind(this)

    public stop(): void {
        for (const job of this.jobs.values()) {
            this.lifecycle.cancel(job, 'Мир остановлен. Договор отменён.')
        }
        this.offers.clear()
        this.invitations.stop()
    }

    public handleDecision(
        issuer: GameCharacter,
        decision: NpcQuestDecision,
        now: number,
        context: NpcQuestDecisionContext = {}
    ): NpcQuestResult {
        switch (decision.type) {
            case 'quest_propose':
            case 'worker_quest_propose':
                return this.invitations.present(issuer, decision, now, context)
            case 'quest_invitation_answer':
                return this.invitations.answer(issuer, decision, now, context)
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

    public previewDecision(
        issuer: GameCharacter,
        decision: NpcQuestDecision,
        now: number,
        context: NpcQuestDecisionContext = {}
    ): string | undefined {
        if (decision.type === 'quest_invitation_answer') {
            return this.invitations.previewAnswer(
                issuer,
                decision,
                now,
                context
            )
        }
        return decision.type === 'quest_propose' ||
            decision.type === 'worker_quest_propose'
            ? this.invitations.previewProposal(issuer, decision, now, context)
            : undefined
    }

    public invitationFor(issuerId: string, targetId: string, now = Date.now()) {
        return this.invitations.invitationFor(issuerId, targetId, now)
    }

    public canInvite(
        issuerId: string,
        targetId: string,
        now = Date.now()
    ): boolean {
        return this.invitations.canInvite(issuerId, targetId, now)
    }

    public propose(
        issuer: GameCharacter,
        targetId: string,
        draft: QuestDraft,
        now: number,
        replaceOffer?: QuestOfferReplacement,
        context: NpcQuestDecisionContext = {}
    ): NpcQuestResult {
        return this.offerOperations.propose(
            issuer,
            targetId,
            draft,
            now,
            replaceOffer,
            context
        )
    }
    public workerPropose(
        issuer: GameCharacter,
        targetId: string,
        requestId: string,
        now: number,
        replaceOffer?: QuestOfferReplacement,
        context: NpcQuestDecisionContext = {}
    ): NpcQuestResult {
        return this.offerOperations.workerPropose(
            issuer,
            targetId,
            requestId,
            now,
            replaceOffer,
            context
        )
    }

    public handle(
        actor: GameCharacter,
        message: NpcQuestClientMessage,
        now: number
    ): NpcQuestResult {
        return handleNpcQuestClient(
            {
                environment: this.environment,
                jobs: this.jobs,
                lifecycle: this.lifecycle,
                record: (entry, time) => this.recordJob(entry, time),
                answer: (person, input, time) =>
                    this.answer(person, input, time),
                inquire: (person, id, index, time) =>
                    this.inquire(person, id, index, time),
            },
            actor,
            message,
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
                recordQuestOffer(this.journal, offer, 'declined', now)
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
        this.invitations.update(now)
        for (const [id, offer] of this.offers) {
            if (!questOfferAvailable(offer, this.environment, now)) {
                recordQuestOffer(
                    this.journal,
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
        return conversationNpcQuests(
            this.jobs.values(),
            this.environment,
            issuerId,
            recipientId
        )
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
