import type { GameCharacter } from '../game/character'
import type { GameRoom } from '../game/room'
import { npcDecisionAudienceError } from './decisionAudience'
import type { NpcAiDiagnostics } from './diagnostics'
import { finishOfferRequest } from './dialogueMemory'
import { recordDialogueAction } from './dialogueResult'
import { npcQuestExecutionContext } from './questPresentation'
import { reportNpcRequestStatus } from './requestStatus'
import type { NpcAiActorState } from './runtimeState'
import type { NpcAiEvent, NpcAiReply } from './types'

type Heard = Extract<NpcAiEvent, { kind: 'message' }>

export function applyNpcSocialReply(
    room: GameRoom,
    diagnostics: NpcAiDiagnostics,
    state: NpcAiActorState,
    event: Heard,
    reply: NpcAiReply,
    actor: GameCharacter,
    now: number
): boolean {
    if (reply.decision !== null && room.social.isDecision(reply.decision)) {
        const error = npcDecisionAudienceError(
            room,
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
                  ? room.social.decide(
                        actor,
                        reply.decision,
                        now,
                        npcQuestExecutionContext(state, reply, event)
                    )
                  : { accepted: false, error, events: [] }
        recordDialogueAction(
            diagnostics,
            state,
            event,
            reply.decision,
            result,
            now
        )
        room.publishEvents(result.events)
        finishOfferRequest(state, event, reply.decision, result.accepted)
        if (!result.accepted) {
            reportNpcRequestStatus(
                room,
                diagnostics,
                state,
                'failed',
                now,
                result.error ?? 'Действие отклонено.',
                event
            )
            return false
        }
    }
    return true
}
