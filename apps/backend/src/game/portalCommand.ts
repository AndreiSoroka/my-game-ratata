import type { UsePortalCommand } from '@my-game-ratata/contracts'

import type { ParseResult } from './messages'

export function parsePortalBoundary(
    record: Record<string, unknown>
): ParseResult {
    const message = parsePortalUse(record)
    return message === undefined
        ? { error: 'Invalid portal endpoint' }
        : { message }
}

export function parsePortalUse(
    record: Record<string, unknown>
): UsePortalCommand | undefined {
    const endpointId = record['endpointId']
    return record['type'] === 'use_portal' &&
        Object.keys(record).length === 2 &&
        typeof endpointId === 'string' &&
        endpointId.length <= 100 &&
        endpointId.trim().length > 0
        ? { type: 'use_portal', endpointId }
        : undefined
}
