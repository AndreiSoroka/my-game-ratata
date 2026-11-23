import {
    type CraftOrderClientMessage,
    itemIds,
} from '@my-game-ratata/contracts'

import type { ParseResult } from './messages'
const invalid = { error: 'Invalid craft order command.' }
function validId(value: unknown): value is string {
    return (
        typeof value === 'string' &&
        value.trim().length > 0 &&
        value.length <= 100
    )
}
function amount(value: unknown): value is number {
    return (
        typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    )
}
export function parseCraftOrderCommand(
    record: Record<string, unknown>
): ParseResult | undefined {
    const type = record['type']
    if (
        type !== 'craft_order_place' &&
        type !== 'craft_order_claim' &&
        type !== 'craft_order_cancel'
    ) {
        return undefined
    }
    const { npcId, requestId } = record
    if (!validId(npcId) || !validId(requestId)) {
        return invalid
    }
    const body = orderBody(record)
    return body === undefined
        ? invalid
        : { message: { ...body, npcId, requestId } }
}
type OrderBody = CraftOrderClientMessage extends infer T
    ? T extends CraftOrderClientMessage
        ? Omit<T, 'npcId' | 'requestId'>
        : never
    : never
function orderBody(record: Record<string, unknown>): OrderBody | undefined {
    const type = record['type']
    if (type === 'craft_order_place') {
        const itemId = itemIds.find((id) => id === record['itemId']),
            expectedTotal = record['expectedTotal']
        return itemId !== undefined && amount(expectedTotal)
            ? { type, itemId, expectedTotal }
            : undefined
    }
    const orderId = record['orderId']
    if (!validId(orderId)) {
        return undefined
    }
    if (type === 'craft_order_cancel') {
        return { type, orderId }
    }
    const expectedRemaining = record['expectedRemaining']
    return type === 'craft_order_claim' && amount(expectedRemaining)
        ? { type, orderId, expectedRemaining }
        : undefined
}
export function parseNpcInteractionService(
    record: Record<string, unknown>
): ParseResult | undefined {
    const { type, targetId, service } = record
    if (type !== 'interact' || service === undefined) {
        return undefined
    }
    if (
        !validId(targetId) ||
        (service !== 'shop' &&
            service !== 'orders' &&
            service !== 'repair' &&
            service !== 'city_affairs' &&
            service !== 'worker_requests')
    ) {
        return { error: 'Invalid NPC interaction service.' }
    }
    return { message: { type, targetId, service } }
}
