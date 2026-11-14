import {
    type MarketClientMessage,
    marketItemIds,
} from '@my-game-ratata/contracts'

import type { ParseResult } from './messages'
const invalid = { error: 'Invalid economy command.' }
function validId(value: unknown): value is string {
    return (
        typeof value === 'string' &&
        value.trim().length > 0 &&
        value.length <= 100
    )
}
function validCount(
    value: unknown,
    minimum: number,
    maximum = Number.MAX_SAFE_INTEGER
): value is number {
    return (
        typeof value === 'number' &&
        Number.isSafeInteger(value) &&
        value >= minimum &&
        value <= maximum
    )
}
function marketHeader(record: Record<string, unknown>) {
    const { npcId, requestId, expectedTotal } = record
    if (
        !validId(npcId) ||
        !validId(requestId) ||
        !validCount(expectedTotal, 0)
    ) {
        return undefined
    }
    return { npcId, requestId, expectedTotal }
}
export function parseEconomyCommand(
    record: Record<string, unknown>
): ParseResult | undefined {
    const type = record['type']
    if (type === 'plant_tree_preview') {
        const result = parsePlant(record['position'])
        return result.message?.type === 'plant_tree' &&
            validId(record['requestId'])
            ? {
                  message: {
                      type,
                      requestId: record['requestId'],
                      position: result.message.position,
                  },
              }
            : invalid
    }
    if (type === 'plant_tree') {
        return parsePlant(record['position'])
    }
    if (type !== 'market_trade' && type !== 'repair_items') {
        return undefined
    }
    const header = marketHeader(record)
    if (header === undefined) {
        return invalid
    }
    const message = type === 'repair_items' ? repair(record) : trade(record)
    return message === undefined
        ? invalid
        : { message: { ...message, ...header } }
}
type MarketBody = Omit<
    Extract<MarketClientMessage, { type: 'market_trade' }>,
    'npcId' | 'requestId' | 'expectedTotal'
>
type RepairBody = Omit<
    Extract<MarketClientMessage, { type: 'repair_items' }>,
    'npcId' | 'requestId' | 'expectedTotal'
>
function trade(record: Record<string, unknown>): MarketBody | undefined {
    const { side, quantity } = record
    const itemId = marketItemIds.find((id) => id === record['itemId'])
    if (
        itemId === undefined ||
        (side !== 'buy' && side !== 'sell') ||
        !validCount(quantity, 1, 100)
    ) {
        return undefined
    }
    return { type: 'market_trade', side, quantity, itemId }
}
function repair(record: Record<string, unknown>): RepairBody | undefined {
    const ids: unknown = record['instanceIds']
    if (
        !Array.isArray(ids) ||
        ids.length < 1 ||
        ids.length > 52 ||
        !ids.every(validId) ||
        new Set(ids).size !== ids.length
    ) {
        return undefined
    }
    return { type: 'repair_items', instanceIds: ids }
}
function parsePlant(position: unknown): ParseResult {
    if (
        position === null ||
        typeof position !== 'object' ||
        !('x' in position) ||
        !('y' in position)
    ) {
        return invalid
    }
    const { x, y } = position
    if (
        typeof x !== 'number' ||
        typeof y !== 'number' ||
        !Number.isFinite(x) ||
        !Number.isFinite(y)
    ) {
        return invalid
    }
    return { message: { type: 'plant_tree', position: { x, y } } }
}
