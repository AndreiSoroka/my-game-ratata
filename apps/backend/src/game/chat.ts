import { PUBLIC_SPEECH_RADIUS } from '@my-game-ratata/contracts'

import { type GameCharacter } from './character'
import { distance } from './math'

export const chatVisibleRadius = PUBLIC_SPEECH_RADIUS

export function resolveChatText(
    speaker: GameCharacter,
    observer: GameCharacter | undefined,
    text: string
): string {
    if (
        observer === undefined ||
        distance(speaker.position, observer.position) <= chatVisibleRadius
    ) {
        return text
    }

    return garbleText(text)
}

export function garbleText(text: string): string {
    const alphabet = 'abracadabraratatamur'
    let result = ''

    for (let index = 0; index < text.length; index += 1) {
        const character = text.charAt(index)

        if (character.trim().length === 0 || !/[\p{L}\p{N}]/u.test(character)) {
            result += character
            continue
        }

        result +=
            alphabet[(character.charCodeAt(0) + index * 7) % alphabet.length] ??
            'a'
    }

    return result
}
