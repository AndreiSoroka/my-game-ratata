import type {
    NpcQuestDecision,
    QuestInvitationSnapshot,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { NpcQuestOfferOperations } from './npcQuestOfferOperations'
import {
    questIntroductionError,
    questPresentationContextError,
    type QuestProposalDecision,
} from './npcQuestProposalPreparation'
import {
    type NpcQuestDecisionContext,
    type NpcQuestEnvironment,
    type NpcQuestResult,
    questActorAvailable,
    questContact,
} from './npcQuestTypes'

export const QUEST_INVITATION_TTL_MS = 120_000
export const QUEST_INVITATION_COOLDOWN_MS = 600_000
type Answer = Extract<NpcQuestDecision, { type: 'quest_invitation_answer' }>
interface Invitation {
    view: QuestInvitationSnapshot
    proposal: QuestProposalDecision
    issuer: GameCharacter
    recipient: GameCharacter
    issuerDeath: number
    recipientDeath: number
}

/** Conversation interest only. No contract slot, reward reservation or client modal is created. */
export class NpcQuestInvitations {
    private readonly pending = new Map<string, Invitation>()
    private readonly cooldown = new Map<string, number>()
    private readonly answeredMessages = new Map<string, number>()
    public constructor(
        private readonly environment: NpcQuestEnvironment,
        private readonly offers: NpcQuestOfferOperations
    ) {}

    public invitationFor(
        issuerId: string,
        targetId: string,
        now: number
    ): QuestInvitationSnapshot | null {
        const entry = this.pending.get(pair(issuerId, targetId))
        return entry !== undefined &&
            entry.view.expiresAt > now &&
            this.sameLives(entry)
            ? structuredClone(entry.view)
            : null
    }

    public canInvite(issuerId: string, targetId: string, now: number): boolean {
        const key = pair(issuerId, targetId)
        const entry = this.pending.get(key)
        const until = Math.max(
            this.cooldown.get(key) ?? 0,
            entry === undefined
                ? 0
                : entry.view.expiresAt + QUEST_INVITATION_COOLDOWN_MS
        )
        return now >= until
    }

    public previewProposal(
        issuer: GameCharacter,
        decision: QuestProposalDecision,
        now: number,
        context: NpcQuestDecisionContext
    ): string | undefined {
        const introduction =
            questIntroductionError(context) ??
            questPresentationContextError(decision.targetId, now, context)
        if (introduction !== undefined) {
            return introduction
        }
        if (context.autonomous !== true) {
            return this.offers.preview(issuer, decision, now, context)
        }
        if (!this.canInvite(issuer.id, decision.targetId, now)) {
            return 'Собеседнику уже предложили обсудить дело. Дождись его ответа или окончания паузы.'
        }
        const prepared = this.offers.prepare(issuer, decision, now, context)
        return 'view' in prepared
            ? undefined
            : (prepared.error ?? 'Это предложение уже показано собеседнику.')
    }

    public present(
        issuer: GameCharacter,
        decision: QuestProposalDecision,
        now: number,
        context: NpcQuestDecisionContext
    ): NpcQuestResult {
        const error = this.previewProposal(issuer, decision, now, context)
        if (error !== undefined) {
            return rejected(error)
        }
        if (context.autonomous === true) {
            return this.stage(issuer, decision, now, context)
        }
        const outcome = this.offers.decide(issuer, decision, now, context)
        if (outcome.accepted) {
            this.clear(issuer.id, decision.targetId)
        }
        return outcome
    }

    public stage(
        issuer: GameCharacter,
        decision: QuestProposalDecision,
        now: number,
        context: NpcQuestDecisionContext
    ): NpcQuestResult {
        const error = this.previewProposal(issuer, decision, now, context)
        if (error !== undefined) {
            return rejected(error)
        }
        const prepared = this.offers.prepare(issuer, decision, now, context)
        if (!('view' in prepared)) {
            return rejected('Это предложение уже показано собеседнику.')
        }
        const recipient = this.environment.getCharacter(decision.targetId)
        if (recipient === undefined) {
            return rejected('Собеседник уже недоступен.')
        }
        const id =
            this.environment.adventure.questFunding.newId('npc-invitation')
        const view: QuestInvitationSnapshot = {
            id,
            issuerId: issuer.id,
            targetId: recipient.id,
            createdAt: now,
            expiresAt: now + QUEST_INVITATION_TTL_MS,
            title: prepared.view.title,
            description: prepared.view.description,
            ...(prepared.view.workerRequestId === undefined
                ? {}
                : { workerRequestId: prepared.view.workerRequestId }),
        }
        this.pending.set(pair(issuer.id, recipient.id), {
            view,
            proposal: structuredClone(decision),
            issuer,
            recipient,
            issuerDeath: issuer.deathSequence,
            recipientDeath: recipient.deathSequence,
        })
        return accepted()
    }

    public previewAnswer(
        issuer: GameCharacter,
        decision: Answer,
        now: number,
        context: NpcQuestDecisionContext
    ): string | undefined {
        const entry = this.pending.get(pair(issuer.id, decision.targetId))
        if (
            entry?.view.id !== decision.invitationId ||
            entry.issuer !== issuer ||
            entry.view.expiresAt <= now ||
            !this.sameLives(entry) ||
            !questContact(entry.recipient, issuer, this.environment, now)
        ) {
            return 'Приглашение уже недоступно. Можно попросить новое задание.'
        }
        const freshness = this.answerFreshness(entry, decision, context)
        return (
            freshness ??
            questPresentationContextError(decision.targetId, now, {
                ...context,
                autonomous: false,
            }) ??
            questIntroductionError({ ...context, autonomous: false }) ??
            (decision.show
                ? this.offers.preview(issuer, entry.proposal, now, context)
                : undefined)
        )
    }

    public answer(
        issuer: GameCharacter,
        decision: Answer,
        now: number,
        context: NpcQuestDecisionContext
    ): NpcQuestResult {
        const error = this.previewAnswer(issuer, decision, now, context)
        if (error !== undefined) {
            return rejected(error)
        }
        const key = pair(issuer.id, decision.targetId)
        const entry = this.pending.get(key)
        if (entry === undefined) {
            return rejected('Приглашение уже недоступно.')
        }
        const outcome = decision.show
            ? this.offers.decide(issuer, entry.proposal, now, context)
            : accepted()
        if (outcome.accepted) {
            this.pending.delete(key)
            this.answeredMessages.set(
                messageKey(issuer.id, context),
                now + QUEST_INVITATION_TTL_MS
            )
            this.cooldown.set(key, now + QUEST_INVITATION_COOLDOWN_MS)
        }
        return outcome
    }

    public clear(issuerId: string, targetId: string): void {
        this.pending.delete(pair(issuerId, targetId))
    }

    public update(now: number): void {
        for (const [key, entry] of this.pending) {
            if (entry.view.expiresAt <= now || !this.sameLives(entry)) {
                this.pending.delete(key)
                this.cooldown.set(
                    key,
                    (entry.view.expiresAt <= now ? entry.view.expiresAt : now) +
                        QUEST_INVITATION_COOLDOWN_MS
                )
            }
        }
        for (const [key, until] of this.cooldown) {
            if (until <= now) {
                this.cooldown.delete(key)
            }
        }
        for (const [key, until] of this.answeredMessages) {
            if (until <= now) {
                this.answeredMessages.delete(key)
            }
        }
    }

    public stop(): void {
        this.pending.clear()
        this.cooldown.clear()
        this.answeredMessages.clear()
    }

    private sameLives(entry: Invitation): boolean {
        return (
            this.environment.getCharacter(entry.issuer.id) === entry.issuer &&
            this.environment.getCharacter(entry.recipient.id) ===
                entry.recipient &&
            entry.issuer.deathSequence === entry.issuerDeath &&
            entry.recipient.deathSequence === entry.recipientDeath &&
            questActorAvailable(entry.issuer) &&
            questActorAvailable(entry.recipient)
        )
    }

    private answerFreshness(
        entry: Invitation,
        decision: Answer,
        context: NpcQuestDecisionContext
    ): string | undefined {
        return context.autonomous === true ||
            context.freshDialogueTargetId !== decision.targetId ||
            context.freshDialogueMessageId === undefined ||
            context.freshDialogueMessageId.length === 0 ||
            context.freshDialogueAt === undefined ||
            context.freshDialogueAt < entry.view.createdAt ||
            this.answeredMessages.has(messageKey(entry.issuer.id, context))
            ? 'Показать условия можно только в ответ на новую реплику приглашённого собеседника.'
            : undefined
    }
}

function pair(issuerId: string, targetId: string): string {
    return JSON.stringify([issuerId, targetId])
}
function messageKey(
    issuerId: string,
    context: NpcQuestDecisionContext
): string {
    return JSON.stringify([
        issuerId,
        context.freshDialogueTargetId,
        context.freshDialogueMessageId,
    ])
}
function accepted(): NpcQuestResult {
    return { accepted: true, error: null, events: [] }
}
function rejected(error: string): NpcQuestResult {
    return { accepted: false, error, events: [] }
}
