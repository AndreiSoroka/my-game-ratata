import type { ChestClientMessage } from '@my-game-ratata/contracts'

export function isChestCommandType(type: unknown): boolean {
    return (
        type === 'open_chest' ||
        type === 'close_chest' ||
        type === 'take_chest_item' ||
        type === 'take_chest_gold' ||
        type === 'put_chest_item' ||
        type === 'take_all_chest_items'
    )
}

export function isChestCommand(message: {
    type: string
}): message is ChestClientMessage {
    return isChestCommandType(message.type)
}

export function parseChestCommand(
    record: Record<string, unknown>
): ChestClientMessage | undefined {
    const chestId = record['chestId']
    if (!validId(chestId)) {
        return undefined
    }
    switch (record['type']) {
        case 'open_chest':
        case 'close_chest':
        case 'take_all_chest_items':
        case 'take_chest_gold':
            return { type: record['type'], chestId }
        case 'take_chest_item':
        case 'put_chest_item': {
            return parseItemTransfer(record, chestId, record['type'])
        }
        default:
            return undefined
    }
}

function parseItemTransfer(
    record: Record<string, unknown>,
    chestId: string,
    type: 'put_chest_item' | 'take_chest_item'
): ChestClientMessage | undefined {
    const itemInstanceId = record['itemInstanceId']
    if (!validId(itemInstanceId)) {
        return undefined
    }
    const quantity = record['quantity']
    if (type !== 'put_chest_item' || quantity === undefined) {
        return { type, chestId, itemInstanceId }
    }
    return typeof quantity === 'number' &&
        Number.isSafeInteger(quantity) &&
        quantity > 0
        ? { type, chestId, itemInstanceId, quantity }
        : undefined
}

function validId(value: unknown): value is string {
    return (
        typeof value === 'string' &&
        value.trim().length > 0 &&
        value.length <= 100
    )
}
