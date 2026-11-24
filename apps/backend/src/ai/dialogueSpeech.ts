import type { GameCharacter } from '../game/character'
import type { CompanionService } from '../game/companions'
import type { GameRoom } from '../game/room'
import { canHearSpeech } from '../game/socialSpeech'
import { createSpeechEvent } from '../game/speechReceipts'
import type { NpcAiDiagnostics } from './diagnostics'
import { speechRadius } from './dialogueResult'
import { attributeNpcSpeech } from './memorySpeechAttribution'
import { reportNpcRequestStatus } from './requestStatus'
import type { NpcAiActorState } from './runtimeState'
import type { NpcAiEvent } from './types'

type Heard = Extract<NpcAiEvent, { kind: 'message' }>

export function speakNpcDialogue(
    room: GameRoom,
    companions: CompanionService,
    diagnostics: NpcAiDiagnostics,
    state: NpcAiActorState,
    event: Heard,
    text: string,
    now: number
): void {
    const actor = state.actor
    if (
        actor !== undefined &&
        handledByDialogueTurn(room, actor, event, text, now)
    ) {
        return
    }
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
    const language = event.language ?? room.localeFor(target.id)
    if (event.legacy === true && state.config.mode !== 'dialogue_only') {
        const result = companions.decide(
            actor,
            { type: 'speak', text, targetId: target.id },
            room,
            now,
            state.token
        )
        room.publishEvents(
            result.events.map((speech) =>
                speech.kind === 'chat'
                    ? attributeNpcSpeech({ ...speech, language }, target.id)
                    : speech
            )
        )
        recordDeliveredDialogue(room, actor, event, text, result.accepted, now)
    } else if (event.channel === 'whisper' || event.legacy === true) {
        const heard = room.social.whispers.send(actor, target, text, now, {
            language,
            keepOriginalForRecipient: true,
        })
        recordDeliveredDialogue(room, actor, event, text, heard, now)
    } else {
        room.publishEvents([
            attributeNpcSpeech(
                { ...createSpeechEvent(actor, text.slice(0, 400)), language },
                target.id
            ),
        ])
        recordDeliveredDialogue(room, actor, event, text, true, now)
    }
}

function handledByDialogueTurn(
    room: GameRoom,
    actor: GameCharacter,
    event: Heard,
    text: string,
    now: number
): boolean {
    if (
        room.social.society.warnings.suppressModelReply(actor, event, text, now)
    ) {
        return true
    }
    if (event.conversationId === undefined) {
        return false
    }
    const delivered = room.social.npcSpeech.turns.reply(actor, event, text, now)
    recordDeliveredDialogue(room, actor, event, text, delivered, now)
    return true
}

function recordDeliveredDialogue(
    room: GameRoom,
    actor: GameCharacter,
    event: Heard,
    text: string,
    delivered: boolean,
    now: number
): void {
    if (delivered) {
        room.social.society.warnings.settle(actor, event, text)
        room.social.recordExchangeInquiry(actor, event, text)
        if (event.ambiguous !== true && event.system !== true) {
            room.social.deliveredQuestQuestion(
                actor,
                event.senderId,
                text.slice(0, 400),
                now
            )
        }
    }
}
