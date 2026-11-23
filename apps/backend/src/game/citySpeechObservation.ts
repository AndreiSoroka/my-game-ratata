import type { GameEventPayload } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { CityWorldState } from './cityWorldState'
import type { NavigationService } from './navigation'
import { NPC_HUM } from './roomNpcReplySpeech'
import { canHearSpeech } from './socialSpeech'
import { addressedSpeechPartner } from './speechReceipts'

/** Only actually heard addressed speech consumes a guide's first-conversation topic. */
export function observeCityIntroductions(
    cities: CityWorldState,
    events: readonly GameEventPayload[],
    findCharacter: (id: string) => GameCharacter | undefined,
    navigationFor: ((actor: GameCharacter) => NavigationService) | undefined,
    now: number
): void {
    if (navigationFor === undefined) {
        return
    }
    for (const event of events) {
        if (
            event.kind !== 'chat' ||
            event.text === NPC_HUM ||
            (event.text?.trim() ?? '') === ''
        ) {
            continue
        }
        const pair = heardPair(event, findCharacter, navigationFor, now)
        if (pair !== undefined) {
            cities.observeSpeech(pair.speaker.id, pair.partner.id)
        }
    }
}

function heardPair(
    event: GameEventPayload,
    findCharacter: (id: string) => GameCharacter | undefined,
    navigationFor: (actor: GameCharacter) => NavigationService,
    now: number
): { speaker: GameCharacter; partner: GameCharacter } | undefined {
    const speaker = findCharacter(event.actorId ?? '')
    const partner = findCharacter(addressedSpeechPartner(event) ?? '')
    return speaker !== undefined &&
        partner !== undefined &&
        (event.audienceIds === undefined ||
            event.audienceIds.includes(partner.id)) &&
        canHearSpeech(
            partner,
            speaker,
            navigationFor(partner),
            now,
            event.targetId === undefined ? 80 : 48
        )
        ? { speaker, partner }
        : undefined
}
