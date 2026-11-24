import {
    type GameEventPayload,
    type NpcQuestClientMessage,
    type NpcQuestDecision,
    type NpcQuestSocialSnapshot,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import {
    answerQuestOffer,
    type QuestAcceptanceContext,
} from './npcQuestAcceptance'
import { NpcQuestBoardOffers } from './npcQuestBoardOffers'
import { handleNpcQuestClient } from './npcQuestClientActions'
import { inquireNpcQuest } from './npcQuestInquiry'
import { NpcQuestInvitations } from './npcQuestInvitations'
import { recordNpcQuest, recordQuestOffer } from './npcQuestJournal'
import { NpcQuestLifecycle } from './npcQuestLifecycle'
import { NpcQuestOfferOperations } from './npcQuestOfferOperations'
import { inspectQuest, observeQuestDeath } from './npcQuestProgress'
import { conversationNpcQuests, snapshotNpcQuests } from './npcQuestSnapshots'
import {
    type NpcQuestDecisionContext,
    type NpcQuestEnvironment,
    type NpcQuestRecord,
    type NpcQuestResult,
    questOfferAvailable,
    type QuestOfferRecord,
    questResult,
} from './npcQuestTypes'
import { QuestBoardPublications } from './questBoardPublications'
import { QuestJournal } from './questJournal'

export type { NpcQuestResult } from './npcQuestTypes'

/** Model prose proposes; only validated commands and resolved events change a contract. */
export class NpcQuestService {
    private readonly offers = new Map<string, QuestOfferRecord>()
    private readonly jobs = new Map<string, NpcQuestRecord>()
    public readonly journal = new QuestJournal()
    public readonly publications: QuestBoardPublications
    public readonly boardOffers: NpcQuestBoardOffers
    public readonly propose: NpcQuestOfferOperations['propose']
    public readonly workerPropose: NpcQuestOfferOperations['workerPropose']
    private readonly acceptanceContext: QuestAcceptanceContext

    private readonly invitations: NpcQuestInvitations
    private readonly offerOperations: NpcQuestOfferOperations
    private readonly lifecycle: NpcQuestLifecycle
    public constructor(private readonly environment: NpcQuestEnvironment) {
        this.publications = new QuestBoardPublications(environment)
        this.offerOperations = new NpcQuestOfferOperations({
            environment,
            offers: this.offers,
            journal: this.journal,
        })
        this.propose = this.offerOperations.propose.bind(this.offerOperations)
        this.workerPropose = this.offerOperations.workerPropose.bind(
            this.offerOperations
        )
        this.invitations = new NpcQuestInvitations(
            environment,
            this.offerOperations
        )
        const reservations = environment.adventure.questFunding.reservations
        this.lifecycle = new NpcQuestLifecycle(
            environment,
            reservations,
            (job) =>
                this.publications.finish(
                    job.view.instanceId,
                    job.view.status === 'completed'
                )
        )
        this.acceptanceContext = {
            environment: this.environment,
            offers: this.offers,
            jobs: this.jobs,
            reservations,
            cancel: (job, notice) => this.lifecycle.cancel(job, notice),
            refresh: (job) => this.lifecycle.refresh(job),
        }
        this.boardOffers = new NpcQuestBoardOffers(
            this.acceptanceContext,
            this.publications,
            this.offerOperations,
            this.lifecycle,
            (job, now) => this.recordJob(job, now)
        )
    }

    public readonly decide = this.handleDecision.bind(this)

    public stop(): void {
        this.publications.closeOpen()
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
            case 'quest_board_publish': {
                const error = this.publications.publish(
                    issuer,
                    decision.draft,
                    now,
                    context
                )
                return questResult(error === undefined, error ?? null)
            }
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
                return questResult(
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
        if (decision.type === 'quest_board_publish') {
            return this.publications.validate(
                issuer,
                decision.draft,
                now,
                context
            )
        }
        if (decision.type === 'quest_offer_revise') {
            return this.offerOperations.previewRevision(issuer, decision, now)
        }
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
            this.acceptanceContext,
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
        this.publications.update(now)
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
            if (event.kind === 'death') {
                this.publications.closeOpen(event.targetId)
            }
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
}
