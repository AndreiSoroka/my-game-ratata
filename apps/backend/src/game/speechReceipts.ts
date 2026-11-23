import type { GameEventPayload } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'

const serials = new WeakMap<GameCharacter, number>()
const addressedSpeech = new WeakMap<GameEventPayload, string>()
const dialogueSpeech = new WeakSet<GameEventPayload>()

/** Server-only attribution preserves the ordinary public audience. */
export function attributeNpcSpeech(
    event: GameEventPayload,
    partnerId: string
): GameEventPayload {
    addressedSpeech.set(event, partnerId)
    return event
}

export function addressedSpeechPartner(
    event: GameEventPayload
): string | undefined {
    return addressedSpeech.get(event) ?? event.targetId
}

export function nextSpeechId(speaker: GameCharacter): number {
    const receipt = (serials.get(speaker) ?? 0) + 1
    serials.set(speaker, receipt)
    return receipt
}

export function createSpeechEvent(
    speaker: GameCharacter,
    text: string,
    audience: Pick<GameEventPayload, 'audienceIds' | 'targetId'> = {}
): GameEventPayload & { speechId: number } {
    return {
        kind: 'chat',
        actorId: speaker.id,
        text,
        speechId: nextSpeechId(speaker),
        ...audience,
    }
}

export function createDialogueSpeechEvent(
    speaker: GameCharacter,
    listener: GameCharacter,
    text: string
): GameEventPayload & { speechId: number } {
    const event = createSpeechEvent(speaker, text, {
        targetId: listener.id,
        audienceIds: [listener.id],
    })
    dialogueSpeech.add(event)
    return event
}

export function isDialogueSpeech(event: GameEventPayload): boolean {
    return dialogueSpeech.has(event)
}

/** Stamping once also preserves the receipt when an already resolved event is replayed. */
export function stampSpeechEvent(
    event: GameEventPayload,
    speaker: GameCharacter | undefined
): void {
    if (
        event.kind === 'chat' &&
        event.speechId === undefined &&
        speaker !== undefined
    ) {
        event.speechId = nextSpeechId(speaker)
    }
}
