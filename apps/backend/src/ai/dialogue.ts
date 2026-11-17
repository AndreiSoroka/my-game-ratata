import type { GameCharacter } from '../game/character'
import type { CompanionService } from '../game/companions'
import type { GameRoom } from '../game/room'
import { npcDecisionAudienceError } from './decisionAudience'
import type { NpcAiDiagnostics } from './diagnostics'
import {
    finishOfferRequest,
    rememberConversation,
    rememberDialogueReply,
} from './dialogueMemory'
import { applyNpcCompanionOrder, consumeNpcWait } from './dialogueOrders'
import {
    abortDialogueTrade,
    beginAcceptedNpcTask,
    dialogueKey,
    dialogueReplyConsumed,
    recordDialogueAction,
    replySpeech,
} from './dialogueResult'
import { speakNpcDialogue } from './dialogueSpeech'
import { acceptsNpcTask, validateNpcDialogueReply } from './dialogueValidation'
import { reportNpcRequestStatus } from './requestStatus'
export { dialogueKey } from './dialogueResult'
import { type NpcAiActorState, npcAiBusyFor } from './runtimeState'
import type { NpcAiEvent, NpcAiReply } from './types'

type Heard = Extract<NpcAiEvent, { kind: 'message' }>

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

    public abortTrade(state: NpcAiActorState, now: number): void {
        abortDialogueTrade(this.room, state, now)
    }

    public respond(
        state: NpcAiActorState,
        actor: GameCharacter,
        reply: NpcAiReply,
        now: number
    ): boolean {
        const event = state.dialogue
        if (event === undefined) {
            return false
        }
        rememberDialogueReply(state, event, reply)
        state.dialogue = undefined
        return this.replyToMessage(state, actor, event, reply, now)
    }

    private replyToMessage(
        state: NpcAiActorState,
        actor: GameCharacter,
        event: Heard,
        reply: NpcAiReply,
        now: number
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
            now,
            (text) => this.speak(state, event, text, now)
        )
        if (requester === undefined) {
            return true
        }
        if (
            wantsTask &&
            !this.accept(state, actor, requester, event, reply, now)
        ) {
            rememberConversation(
                state,
                dialogueKey(event),
                'Сервер отклонил принятие поручения: оно уже принято другим NPC либо недоступно. Я его не принимала.'
            )
            this.speak(
                state,
                event,
                'Это поручение уже принято или сейчас недоступно.',
                now
            )
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
            !this.applySocialReply(state, event, reply, actor, now)
        ) {
            return true
        }
        const text = replySpeech(reply)
        if (text !== null) {
            this.speak(state, event, text, now)
        }
        const socialHandled =
            reply.decision !== null &&
            this.room.social.isDecision(reply.decision)
        return dialogueReplyConsumed(state, reply, wantsTask, socialHandled)
    }

    private applySocialReply(
        state: NpcAiActorState,
        event: Heard,
        reply: NpcAiReply,
        actor: GameCharacter,
        now: number
    ): boolean {
        if (
            reply.decision !== null &&
            this.room.social.isDecision(reply.decision)
        ) {
            const error = npcDecisionAudienceError(
                this.room,
                reply.decision,
                actor.id,
                event.senderId
            )
            const result =
                state.config.mode === 'dialogue_only'
                    ? {
                          accepted: false,
                          error: 'Я могу объяснить известное мне, но не принимаю такое действие.',
                          events: [],
                      }
                    : error === undefined
                      ? this.room.social.decide(actor, reply.decision, now)
                      : { accepted: false, error, events: [] }
            recordDialogueAction(
                this.diagnostics,
                state,
                event,
                reply.decision,
                result,
                now
            )
            this.room.publishEvents(result.events)
            finishOfferRequest(state, event, reply.decision, result.accepted)
            if (!result.accepted) {
                reportNpcRequestStatus(
                    this.room,
                    this.diagnostics,
                    state,
                    'failed',
                    now,
                    result.error ?? 'Действие отклонено.',
                    event
                )
                this.speak(
                    state,
                    event,
                    result.error ?? 'Не удалось выполнить действие.',
                    now
                )
                return false
            }
        }
        return true
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
                      },
                replySpeech(reply)
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
