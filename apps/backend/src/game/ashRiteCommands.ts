import {
    type AbilityClientMessage,
    type AshRiteId,
    type AshRiteMessage,
    isAshRiteId,
    isSkeletonOrder,
} from '@my-game-ratata/contracts'

import { validAbilityTargetId } from './prayerIntentParsing'

export function parseAshRite(
    id: AshRiteId,
    record: Record<string, unknown>
): AshRiteMessage | undefined {
    const targetId = record['targetId']
    if (!validAbilityTargetId(targetId)) {
        return undefined
    }
    if (id === 'ash_order') {
        const order = record['order']
        return Object.keys(record).length === 4 && isSkeletonOrder(order)
            ? { type: 'use_ability', abilityId: id, targetId, order }
            : undefined
    }
    return Object.keys(record).length === 3
        ? { type: 'use_ability', abilityId: id, targetId }
        : undefined
}

export function isAshRiteMessage(
    message: Extract<AbilityClientMessage, { type: 'use_ability' }>
): message is AshRiteMessage {
    return isAshRiteId(message.abilityId)
}
