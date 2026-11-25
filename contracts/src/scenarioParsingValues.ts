import { FARM_PLOTS } from './farms'
import { type ItemId, itemIds } from './inventory'
import type { ScenarioSearchKind } from './scenarios'
import { WORLD_LOCATION_DEFINITIONS } from './world'
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
export function validLocationId(value: unknown): value is string {
    return (
        typeof value === 'string' &&
        WORLD_LOCATION_DEFINITIONS.some((location) => location.id === value)
    )
}
export function validFarmPlot(plotId: unknown, locationId: unknown): boolean {
    return FARM_PLOTS.some(
        (plot) => plot.id === plotId && plot.locationId === locationId
    )
}
export function optionalPinnedLocationId(
    value: unknown,
    targetId: unknown
): value is string | undefined {
    return (
        value === undefined ||
        (targetId !== undefined && validLocationId(value))
    )
}
export function itemId(value: unknown): value is ItemId {
    return typeof value === 'string' && itemIds.some((id) => id === value)
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
        'brushwood',
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
