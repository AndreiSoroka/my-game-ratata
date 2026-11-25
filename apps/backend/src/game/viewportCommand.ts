import {
    getWorldLocationDefinition,
    type ViewportBounds,
} from '@my-game-ratata/contracts'

import type { ParseResult } from './messages'

const maximumDimension = 65_536
const maximumCoordinate = 1_000_000

export function parseViewportCommand(
    record: Record<string, unknown>,
    hasLocation: (id: string) => boolean = (id) =>
        getWorldLocationDefinition(id) !== undefined
): ParseResult {
    const locationId = record['locationId']
    const bounds = parseBounds(record['bounds'])
    if (
        typeof locationId !== 'string' ||
        !hasLocation(locationId) ||
        bounds === undefined
    ) {
        return { error: 'Invalid viewport hint' }
    }
    return { message: { type: 'set_viewport', locationId, bounds } }
}

function parseBounds(input: unknown): ViewportBounds | undefined {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
        return undefined
    }
    const bounds = input as Record<string, unknown>
    const left = coordinate(bounds['left'])
    const top = coordinate(bounds['top'])
    const right = coordinate(bounds['right'])
    const bottom = coordinate(bounds['bottom'])
    if (
        left === undefined ||
        top === undefined ||
        right === undefined ||
        bottom === undefined
    ) {
        return undefined
    }
    if (
        right <= left ||
        bottom <= top ||
        right - left > maximumDimension ||
        bottom - top > maximumDimension
    ) {
        return undefined
    }
    return { left, top, right, bottom }
}

function coordinate(value: unknown): number | undefined {
    return typeof value === 'number' &&
        Number.isFinite(value) &&
        Math.abs(value) <= maximumCoordinate
        ? value
        : undefined
}
