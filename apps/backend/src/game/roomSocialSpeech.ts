import type { ClientMessage } from '@my-game-ratata/contracts'

import type { NpcAiCoordinator } from '../ai/coordinator'
import type { GameCharacter } from './character'
import { interactionRangeText } from './interactionRangeText'
import type { GameRoom } from './room'
import { type NearbySpeechObserver, sayNearby } from './roomNearbySpeech'
import { createSpeechEvent } from './speechReceipts'
import { WHISPER_RANGE, type WhisperService } from './whispers'

export function handleSocialSpeech(
    room: GameRoom,
    ai: NpcAiCoordinator | undefined,
    whispers: WhisperService,
    actor: GameCharacter,
    message: ClientMessage,
    now: number,
    notice: (text: string) => void,
    onSpeech?: NearbySpeechObserver
): boolean {
    if (message.type === 'chat') {
        sayNearby(room, ai, actor, message, now, onSpeech)
        return true
    }
    if (
        message.type === 'whisper' ||
        message.type === 'whisper_open' ||
        message.type === 'whisper_close'
    ) {
        if (!whispers.handle(actor, message, now)) {
            notice(
                `Шёпот слышен ${interactionRangeText(WHISPER_RANGE, room.navigationFor(actor).grid.tileWidth)} при прямой видимости.`
            )
        } else if (message.type === 'whisper_open') {
            room.social.npcSpeech.turns.close(
                actor.id,
                'whisper',
                message.targetId
            )
        }
        return true
    }
    return handleAiCompanionRequest(room, ai, actor, message, now, notice)
}

function handleAiCompanionRequest(
    room: GameRoom,
    ai: NpcAiCoordinator | undefined,
    actor: GameCharacter,
    message: ClientMessage,
    now: number,
    notice: (text: string) => void
): boolean {
    if (
        message.type !== 'companion_request' ||
        ai?.configured(message.targetId) !== true
    ) {
        return false
    }
    if (message.request === 'talk') {
        return false
    }
    if (message.request === 'dismiss') {
        const own = ai.withdraw(actor, message.targetId, now)
        if (!own) {
            notice('Этот персонаж не связан с тобой сопровождением.')
        } else {
            notice('Сопровождение прекращено по твоему решению.')
        }
        return true
    }
    const language = room.localeFor(actor.id)
    const untilReturn = message.waitMode === 'until_return'
    const requests =
        language === 'en'
            ? {
                  follow: 'Come with me, if you are willing to follow.',
                  guard: 'Please guard this place if you are willing.',
                  wait: untilReturn
                      ? 'Wait here until I return, then follow me again if you are willing.'
                      : 'Wait here until I ask you to move on, if you are willing.',
                  help: 'Please help me in combat if you are willing.',
              }
            : {
                  follow: 'Пойдём вместе: следуй за мной, если согласишься.',
                  guard: 'Пожалуйста, охраняй это место, если согласишься.',
                  wait: untilReturn
                      ? 'Подожди здесь до моего возвращения, затем снова следуй за мной, если согласишься.'
                      : 'Подожди здесь, пока я не попрошу идти дальше, если согласишься.',
                  help: 'Пожалуйста, помоги мне в бою, если ты согласишься.',
              }
    const text = requests[message.request]
    const event = createSpeechEvent(actor, text)
    room.social.npcSpeech.receive(
        actor,
        {
            kind: 'message',
            id: `request:${actor.id}:${String(event.speechId)}`,
            senderId: actor.id,
            text,
            language,
            channel: 'whisper',
            locationId: actor.locationId,
            position: { ...actor.position },
            at: now,
        },
        message.targetId
    )
    return true
}
