import type { CompanionService } from '../game/companions'
import type { GameRoom } from '../game/room'
import { canHearSpeech } from '../game/socialSpeech'
import { createSpeechEvent } from '../game/speechReceipts'
import type { NpcAiDiagnostics } from './diagnostics'
import { speechRadius } from './dialogueResult'
import { reportNpcRequestStatus } from './requestStatus'
import type { NpcAiActorState } from './runtimeState'
import type { NpcAiEvent } from './types'

export function speakNpcDialogue(
    room: GameRoom,
    companions: CompanionService,
    diagnostics: NpcAiDiagnostics,
    state: NpcAiActorState,
    event: Extract<NpcAiEvent, { kind: 'message' }>,
    text: string,
    now: number
): void {
    const actor = state.actor
    const target = room.getCharacter(event.senderId)
    if (
        actor === undefined ||
        target === undefined ||
        !canHearSpeech(
            target,
            actor,
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
            'Собеседник вне слышимости; реплика не отправлена.',
            event
        )
        return
    }
    if (event.legacy === true && state.config.mode !== 'dialogue_only') {
        const result = companions.decide(
            actor,
            { type: 'speak', text, targetId: target.id },
            room,
            now,
            state.token
        )
        room.publishEvents(result.events)
    } else if (event.channel === 'whisper' || event.legacy === true) {
        room.social.whispers.send(actor, target, text, now)
    } else {
        room.publishEvents([createSpeechEvent(actor, text.slice(0, 400))])
    }
}
