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
            const itemInstanceId = record['itemInstanceId']
            return validId(itemInstanceId)
                ? { type: record['type'], chestId, itemInstanceId }
                : undefined
        }
        default:
            return undefined
    }
}

function validId(value: unknown): value is string {
    return (
        typeof value === 'string' &&
        value.trim().length > 0 &&
        value.length <= 100
    )
}
