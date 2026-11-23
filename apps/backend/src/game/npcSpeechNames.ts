import { NPC_ENGLISH_NAMES } from '@my-game-ratata/contracts'

import { companionProfiles, serviceDialogueNames } from './companionProfiles'

function normalizedName(text: string): string {
    return text.trim().normalize('NFC').toLocaleLowerCase('ru')
}

function aliasLength(alias: string, normalizedText: string): number {
    const name = normalizedName(alias)
    return name.length > 0 &&
        normalizedText.startsWith(name) &&
        (normalizedText.length === name.length ||
            /^[\s,!?:.…—-]/u.test(normalizedText.slice(name.length)))
        ? name.length
        : 0
}

export function afterPlayerSpokenName(
    nickname: string,
    text: string
): string | undefined {
    const normalized = normalizedName(text)
    const length = aliasLength(nickname, normalized)
    return length === 0 ? undefined : normalized.slice(length)
}

/** Match a spoken name as a complete prefix, keeping the most specific alias. */
export function afterNpcSpokenName(
    id: string,
    nickname: string,
    text: string
): string | undefined {
    const normalized = normalizedName(text)
    const names = [
        ...(companionProfiles[id]?.dialogueNames ?? []),
        ...(serviceDialogueNames[id] ?? []),
        NPC_ENGLISH_NAMES[id] ?? '',
        nickname,
        nickname.trim().split(/\s+/u).at(-1) ?? '',
    ]
    const prefixLength = Math.max(
        ...names.map((alias) => aliasLength(alias, normalized))
    )
    return prefixLength === 0 ? undefined : normalized.slice(prefixLength)
}
