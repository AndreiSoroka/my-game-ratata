import { type GameCharacter } from './character'
import { distance } from './math'

export const chatVisibleRadius = 80

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

function garbleText(text: string): string {
    const alphabet = 'abracadabraratatamur'
    let result = ''

    for (let index = 0; index < text.length; index += 1) {
        const character = text.charAt(index)

        if (character.trim().length === 0 || !/[a-zA-Z0-9]/.test(character)) {
            result += character
            continue
        }

        result +=
            alphabet[(character.charCodeAt(0) + index * 7) % alphabet.length] ??
            'a'
    }

    return result
}
