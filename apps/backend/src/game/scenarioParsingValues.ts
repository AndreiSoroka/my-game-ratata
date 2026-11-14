import {
    ITEM_DEFINITIONS,
    type ItemId,
    type ScenarioSearchKind,
} from '@my-game-ratata/contracts'

export function object(value: unknown): Record<string, unknown> | undefined {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined
}
export function onlyKeys(
    record: Record<string, unknown>,
    keys: readonly string[]
): boolean {
    return Object.keys(record).every((key) => keys.includes(key))
}
export function validId(value: unknown): value is string {
    return (
        typeof value === 'string' &&
        value.length > 0 &&
        value.length <= 100 &&
        value.trim() === value &&
        Array.from(value).every(
            (character) =>
                character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127
        )
    )
}
export function validName(value: unknown): value is string {
    return (
        typeof value === 'string' &&
        value.trim().length > 0 &&
        value.length <= 80
    )
}
export function optionalId(value: unknown): value is string | undefined {
    return value === undefined || validId(value)
}
export function itemId(value: unknown): value is ItemId {
    return typeof value === 'string' && Object.hasOwn(ITEM_DEFINITIONS, value)
}
export function optionalItem(value: unknown): value is ItemId | undefined {
    return value === undefined || itemId(value)
}
export function searchKind(value: unknown): value is ScenarioSearchKind {
    return [
        'tree',
        'stone',
        'herbs',
        'fiber',
        'scrap',
        'grain',
        'enemy',
        'chest',
        'item',
    ].some((kind) => kind === value)
}
export function integer(
    value: unknown,
    min: number,
    max: number
): value is number {
    return (
        typeof value === 'number' &&
        Number.isSafeInteger(value) &&
        value >= min &&
        value <= max
    )
}
