import type { GameCharacter } from '../game/character'
import type { GameRoom } from '../game/room'
import { canHearSpeech } from '../game/socialSpeech'
import type { NpcAiDiagnostics } from './diagnostics'
import { recordDialogueAction, speechRadius } from './dialogueResult'
import { reportNpcRequestStatus } from './requestStatus'
import type { NpcAiActorState } from './runtimeState'
import type { NpcAiEvent, NpcAiReply } from './types'

type Heard = Extract<NpcAiEvent, { kind: 'message' }>
export function acceptsNpcTask(event: Heard, reply: NpcAiReply): boolean {
    return (
        reply.taskAcceptance === 'accept' ||
        reply.taskAcceptance === 'replace' ||
        (event.legacy === true && reply.taskAcceptance === undefined)
    )
}
export function validateNpcDialogueReply(
    room: GameRoom,
    diagnostics: NpcAiDiagnostics,
    state: NpcAiActorState,
    actor: GameCharacter,
    event: Heard,
    reply: NpcAiReply,
    wantsTask: boolean,
    now: number,
    speak: (text: string) => void
): GameCharacter | undefined {
    const requester = room.getCharacter(event.senderId)
    if (
        requester === undefined ||
        !canHearSpeech(
            actor,
            requester,
            room.navigationFor(actor),
            now,
            speechRadius(event)
        )
    ) {
        reportNpcRequestStatus(
            room,
            diagnostics,
            state,
            'undelivered',
            now,
            'Собеседник отошёл; ответ не произнесён.',
            event
        )
        return undefined
    }
    if (!wantsTask && unacceptedPhysicalReply(room, reply)) {
        if (reply.decision !== null) {
            recordDialogueAction(
                diagnostics,
                state,
                event,
                reply.decision,
                { accepted: false, error: 'task_not_accepted', events: [] },
                now
            )
        }
        reportNpcRequestStatus(
            room,
            diagnostics,
            state,
            'failed',
            now,
            'Действие не начато: поручение не принято.',
            event
        )
        speak(
            'Я услышала просьбу, но не приняла поручение и не начала действие.'
        )
        return undefined
    }
    return requester
}
function unacceptedPhysicalReply(room: GameRoom, reply: NpcAiReply): boolean {
    return (
        reply.companionOrder != null ||
        (reply.decision !== null &&
            !room.social.isDecision(reply.decision) &&
            reply.decision.type !== 'speak')
    )
}
