import type { GameCharacter } from '../game/character'
import type { CompanionService } from '../game/companions'
import type { GameRoom } from '../game/room'
import { observedNpcCommandCapabilities } from './commandCapabilities'
import type { NpcAiDiagnostics } from './diagnostics'
import { rememberDialogueReply } from './dialogueMemory'
import { applyNpcCompanionOrder, consumeNpcWait } from './dialogueOrders'
import {
    abortDialogueTrade,
    beginAcceptedNpcTask,
    dialogueReplyConsumed,
    replySpeech,
} from './dialogueResult'
import { applyNpcSocialReply } from './dialogueSocialReply'
import { speakNpcDialogue } from './dialogueSpeech'
import { acceptsNpcTask, validateNpcDialogueReply } from './dialogueValidation'
import type { NpcAiObservation } from './observationTypes'
import { reportNpcRequestStatus } from './requestStatus'
export { dialogueKey } from './dialogueResult'
import { type NpcAiActorState, npcAiBusyFor } from './runtimeState'
import { isNpcSelfDecision, type NpcSelfDecision } from './selfDecisions'
import {
    finishNpcTravelStatus,
    reportDialogueSelfDecision,
} from './selfDecisionSession'
import type { NpcAiEvent, NpcAiReply } from './types'

type Heard = Extract<NpcAiEvent, { kind: 'message' }>
type ApplySelfDecision = (
    decision: NpcSelfDecision,
    event: Heard
) => import('../game/agentDecisions').AgentDecisionResult

export class NpcAiDialogue {
    private readonly claims = new Map<string, string>()
    public constructor(
        private readonly room: GameRoom,
        private readonly companions: CompanionService,
        private readonly diagnostics: NpcAiDiagnostics
    ) {}

    public claimedBy(id: string): string | undefined {
        return this.claims.get(id)
    }

    public commandCapabilities(
        state: NpcAiActorState,
        observation: NpcAiObservation,
        now: number
    ) {
        return observedNpcCommandCapabilities(
            this.room,
            this.companions,
            state,
            observation,
            now
        )
    }

    public abortTrade(state: NpcAiActorState, now: number): void {
        abortDialogueTrade(this.room, state, now)
    }

    public respond(
        state: NpcAiActorState,
        actor: GameCharacter,
        reply: NpcAiReply,
        now: number,
        applySelfDecision: ApplySelfDecision
    ): boolean {
        const event = state.dialogue
        if (event === undefined) {
            return false
        }
        state.dialogue = undefined
        return this.replyToMessage(
            state,
            actor,
            event,
            reply,
            now,
            applySelfDecision
        )
    }

    private replyToMessage(
        state: NpcAiActorState,
        actor: GameCharacter,
        event: Heard,
        reply: NpcAiReply,
        now: number,
        applySelfDecision: ApplySelfDecision
    ): boolean {
        const wantsTask = acceptsNpcTask(event, reply)
        const requester = validateNpcDialogueReply(
            this.room,
            this.diagnostics,
            state,
            actor,
            event,
            reply,
            wantsTask,
            now
        )
        if (requester === undefined) {
            return true
        }
        if (isNpcSelfDecision(reply.decision)) {
            const result = applySelfDecision(reply.decision, event)
            reportDialogueSelfDecision(
                this.room,
                this.diagnostics,
                state,
                event,
                reply.decision,
                result,
                now
            )
            return (
                !result.accepted ||
                this.publishReply(state, event, reply, false, now)
            )
        }
        if (
            wantsTask &&
            !this.accept(state, actor, requester, event, reply, now)
        ) {
            reportNpcRequestStatus(
                this.room,
                this.diagnostics,
                state,
                'declined',
                now,
                'Поручение недоступно или уже принято.',
                event
            )
            return true
        }
        return this.publishReply(state, event, reply, wantsTask, now)
    }

    private publishReply(
        state: NpcAiActorState,
        event: Heard,
        reply: NpcAiReply,
        wantsTask: boolean,
        now: number
    ): boolean {
        const actor = state.actor
        if (
            actor === undefined ||
            !applyNpcSocialReply(
                this.room,
                this.diagnostics,
                state,
                event,
                reply,
                actor,
                now
            )
        ) {
            return true
        }
        if (!isNpcSelfDecision(reply.decision)) {
            reportNpcRequestStatus(
                this.room,
                this.diagnostics,
                state,
                wantsTask
                    ? 'accepted'
                    : reply.taskAcceptance === 'decline'
                      ? 'declined'
                      : 'completed',
                now,
                undefined,
                event
            )
        }
        const text = replySpeech(reply)
        rememberDialogueReply(state, event, reply)
        if (text !== null) {
            this.speak(state, event, text, now)
        } else if (
            reply.decision !== null ||
            reply.companionOrder != null ||
            reply.offerService != null
        ) {
            this.room.social.npcSpeech.turns.reply(actor, event, '', now)
        } else {
            this.room.social.npcSpeech.fail(event, now)
        }
        if (reply.offerService != null) {
            this.room.social.npcSpeech.offerService(
                actor,
                event.senderId,
                reply.offerService,
                now
            )
        }
        const socialHandled =
            reply.decision !== null &&
            this.room.social.isDecision(reply.decision)
        return dialogueReplyConsumed(state, reply, wantsTask, socialHandled)
    }

    private accept(
        state: NpcAiActorState,
        actor: GameCharacter,
        requester: GameCharacter,
        event: Heard,
        reply: NpcAiReply,
        now: number
    ): boolean {
        if (!this.mayAccept(state, actor, requester, event, reply)) {
            return false
        }
        if (
            reply.companionOrder != null &&
            !applyNpcCompanionOrder(
                this.room,
                this.companions,
                actor,
                requester,
                reply.companionOrder,
                now,
                reply.waitMode ?? undefined,
                event.actorPosition === undefined ||
                    event.actorLocationId === undefined
                    ? undefined
                    : {
                          locationId: event.actorLocationId,
                          position: event.actorPosition,
                      }
            )
        ) {
            return false
        }
        this.claims.set(event.id, actor.id)
        if (this.claims.size > 512) {
            const first = this.claims.keys().next().value
            if (first !== undefined) {
                this.claims.delete(first)
            }
        }
        if (reply.companionOrder == null) {
            consumeNpcWait(this.room, this.companions, actor, requester, now)
            if (state.token !== undefined) {
                this.companions.setModelControlExclusive(
                    actor,
                    state.token,
                    true,
                    now
                )
            }
            this.companions.decide(
                actor,
                { type: 'cancel_control' },
                this.room,
                now,
                state.token
            )
        }
        finishNpcTravelStatus(
            this.room,
            this.diagnostics,
            state,
            'cancelled',
            now
        )
        beginAcceptedNpcTask(state, event, reply, requester, now)
        return true
    }

    private mayAccept(
        state: NpcAiActorState,
        actor: GameCharacter,
        requester: GameCharacter,
        event: Heard,
        reply: NpcAiReply
    ): boolean {
        const owner = this.claims.get(event.id)
        const replacing =
            state.task?.requesterId != null &&
            reply.taskAcceptance !== 'replace' &&
            event.legacy !== true
        return (
            !replacing &&
            !npcAiBusyFor(state, requester.id) &&
            (owner === undefined || owner === actor.id) &&
            event.system !== true &&
            !this.room.social.exchanges.isPaused(actor.id)
        )
    }

    public speak(
        state: NpcAiActorState,
        event: Heard,
        text: string,
        now: number
    ): void {
        speakNpcDialogue(
            this.room,
            this.companions,
            this.diagnostics,
            state,
            event,
            text,
            now
        )
    }
}
