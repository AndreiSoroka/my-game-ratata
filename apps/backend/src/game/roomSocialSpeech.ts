import type { ClientMessage } from '@my-game-ratata/contracts'

import type { NpcAiCoordinator } from '../ai/coordinator'
import type { GameCharacter } from './character'
import type { GameRoom } from './room'
import { canHearSpeech, speechAvailable } from './socialSpeech'
import { projectSpeechFocus } from './speechFocus'
import { createSpeechEvent } from './speechReceipts'
import type { WhisperService } from './whispers'

export function handleSocialSpeech(
    room: GameRoom,
    ai: NpcAiCoordinator | undefined,
    whispers: WhisperService,
    actor: GameCharacter,
    message: ClientMessage,
    now: number,
    notice: (text: string) => void,
    onSpeech?: (targetId: string | undefined, text: string, id: string) => void
): boolean {
    if (message.type === 'chat') {
        sayPublic(room, ai, actor, message, now, onSpeech)
        return true
    }
    if (
        message.type === 'whisper' ||
        message.type === 'whisper_open' ||
        message.type === 'whisper_close'
    ) {
        if (!whispers.handle(actor, message, now)) {
            notice(
                'Подойди к собеседнику ближе: шёпот слышен в пределах 48 шагов и прямой видимости.'
            )
        }
        return true
    }
    return handleAiCompanionRequest(ai, actor, message, now, notice)
}

function sayPublic(
    room: GameRoom,
    ai: NpcAiCoordinator | undefined,
    actor: GameCharacter,
    message: Extract<ClientMessage, { type: 'chat' }>,
    now: number,
    onSpeech?: (targetId: string | undefined, text: string, id: string) => void
): void {
    if (!speechAvailable(actor) || !actor.soul.canSpeak) {
        return
    }

    const event = createSpeechEvent(actor, message.text)
    const focus = projectSpeechFocus(room, actor, message.focusKey, now)
    room.publishEvents([event])
    const hinted = room.getCharacter(
        message.targetId ?? (focus?.kind === 'character' ? focus.id : '')
    )
    const targetId =
        hinted !== undefined &&
        canHearSpeech(hinted, actor, room.navigationFor(actor), now)
            ? hinted.id
            : undefined
    onSpeech?.(
        targetId,
        message.text,
        `say:${actor.id}:${String(event.speechId)}`
    )
    ai?.hear(
        actor,
        {
            kind: 'message',
            id: `say:${actor.id}:${String(event.speechId)}`,
            senderId: actor.id,
            text: message.text,
            channel: 'say',
            ...(focus === undefined ? {} : { focus }),
            locationId: actor.locationId,
            position: { ...actor.position },
            at: now,
        },
        targetId
    )
}

function handleAiCompanionRequest(
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
        if (message.text === undefined) {
            return false
        }
        ai.talk(actor, message, now)
        return true
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
    const requests = {
        follow: 'Пойдём вместе: следуй за мной, если согласишься.',
        guard: 'Пожалуйста, охраняй это место, если согласишься.',
        wait:
            message.waitMode === 'until_return'
                ? 'Подожди здесь до моего возвращения, затем снова следуй за мной, если согласишься.'
                : 'Подожди здесь, пока я не попрошу идти дальше, если согласишься.',
        help: 'Пожалуйста, помоги мне в бою, если ты согласишься.',
    }
    const text = requests[message.request]
    const event = createSpeechEvent(actor, text)
    ai.hear(
        actor,
        {
            kind: 'message',
            id: `request:${actor.id}:${String(event.speechId)}`,
            senderId: actor.id,
            text,
            channel: 'whisper',
            locationId: actor.locationId,
            position: { ...actor.position },
            at: now,
        },
        message.targetId
    )
    return true
}
