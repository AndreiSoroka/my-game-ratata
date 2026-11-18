import type { GameEventPayload } from '@my-game-ratata/contracts'

const addressedSpeech = new WeakMap<GameEventPayload, string>()

/** Addressing public speech does not change its audience or open a whisper. */
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
