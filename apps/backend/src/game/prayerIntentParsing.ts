import type { PrayerIntent } from '@my-game-ratata/contracts'

import { parseWorldCombatTarget } from './combatTargetParsing'

export function parsePrayerIntent(input: unknown): PrayerIntent | undefined {
    if (!isRecord(input)) {
        return undefined
    }
    const record = input
    const mode = record['mode']
    const targetId = record['targetId']
    if (mode === 'purify_grave') {
        const target = parseWorldCombatTarget(record['target'])
        return target !== undefined && targetId === undefined
            ? { mode, target }
            : undefined
    }
    if (record['target'] !== undefined) {
        return undefined
    }
    return parseCharacterPrayerIntent(record)
}

function parseCharacterPrayerIntent(
    record: Record<string, unknown>
): PrayerIntent | undefined {
    const mode = record['mode']
    const targetId = record['targetId']
    if (mode === 'devotion' && targetId === undefined) {
        return { mode }
    }
    if (
        (mode === 'harm' || mode === 'ward') &&
        (targetId === undefined || validAbilityTargetId(targetId))
    ) {
        return targetId === undefined ? { mode } : { mode, targetId }
    }
    if (
        (mode === 'restore' || mode === 'revive') &&
        validAbilityTargetId(targetId)
    ) {
        return { mode, targetId }
    }
    return undefined
}
export function validAbilityTargetId(value: unknown): value is string {
    return (
        typeof value === 'string' &&
        value.trim().length > 0 &&
        value.length <= 100
    )
}
function isRecord(input: unknown): input is Record<string, unknown> {
    return input !== null && typeof input === 'object' && !Array.isArray(input)
}
