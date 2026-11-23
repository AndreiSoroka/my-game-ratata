import type { AgentDecision } from '@my-game-ratata/contracts'

import type { AgentDecisionResult } from '../game/agentDecisions'
import type { GameCharacter } from '../game/character'
import type { NpcAiDiagnostics } from './diagnostics'
import type { NpcAiActorState } from './runtimeState'
import type { NpcAiEvent, NpcAiReply } from './types'
type Heard = Extract<NpcAiEvent, { kind: 'message' }>

export function recordDialogueAction(
    log: NpcAiDiagnostics,
    state: NpcAiActorState,
    event: Extract<NpcAiEvent, { kind: 'message' }>,
    decision: AgentDecision,
    result: AgentDecisionResult,
    now: number
): void {
    const reason = result.error ?? 'resolved'
    log.record({
        actorId: state.config.actorId,
        taskId: event.id,
        request: event.text,
        category: result.accepted ? 'action_completed' : 'action_rejected',
        action: decision,
        reason,
        at: now,
    })
}
export function dialogueKey(event: Heard): string {
    return event.channel === 'whisper' ? `whisper:${event.senderId}` : 'say'
}

export function replySpeech(reply: NpcAiReply): string | null {
    const speech =
        reply.speech ??
        (reply.decision?.type === 'speak' ? reply.decision.text : null)
    return speech == null || speech.trim().length === 0 ? null : speech.trim()
}

export function dialogueOnlyReply(reply: NpcAiReply): NpcAiReply {
    return {
        ...reply,
        speech: replySpeech(reply),
        decision: null,
        taskAcceptance: 'none',
        companionOrder: null,
        done: true,
    }
}

export function speechRadius(event: Heard): number {
    return event.legacy === true ? 64 : event.channel === 'whisper' ? 48 : 80
}

export function dialogueReplyConsumed(
    state: NpcAiActorState,
    reply: NpcAiReply,
    wantsTask: boolean,
    socialHandled: boolean
): boolean {
    const consumed =
        reply.decision === null ||
        reply.decision.type === 'speak' ||
        reply.companionOrder != null ||
        socialHandled
    if (wantsTask && reply.done && consumed) {
        state.task = null
        state.events = []
    }
    return !wantsTask || consumed
}

export function beginAcceptedNpcTask(
    state: NpcAiActorState,
    event: Heard,
    reply: NpcAiReply,
    requester: GameCharacter,
    now: number
): void {
    state.pending = undefined
    state.guide = undefined
    state.events = []
    state.task =
        reply.companionOrder != null
            ? null
            : {
                  id: event.id,
                  sourceId: event.id,
                  audienceKey: dialogueKey(event),
                  requesterId: requester.id,
                  request: event.text,
                  ...(event.language === undefined
                      ? {}
                      : { language: event.language }),
                  steps: 1,
                  lastKnownRequester: {
                      locationId: requester.locationId,
                      position: { ...requester.position },
                  },
              }
    state.memory = reply.memory.slice(0, 2000)
    if (state.task !== null) {
        state.events.push({
            kind: 'world',
            id: `${event.id}:accepted`,
            reason: 'task_accepted',
            at: now,
        })
    }
}

export function abortDialogueTrade(
    room: import('../game/room').GameRoom,
    state: NpcAiActorState,
    now: number
): void {
    const actor = state.actor
    if (actor === undefined) {
        return
    }
    const exchange = room.social.exchanges.snapshot(actor.id)
    if (exchange !== null) {
        room.social.exchanges.handle(
            actor,
            { type: 'exchange_cancel', exchangeId: exchange.id },
            now
        )
    }
}
