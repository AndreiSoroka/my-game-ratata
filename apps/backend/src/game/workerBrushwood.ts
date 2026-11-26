import type { MarketRow } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { countInventoryItem } from './inventory'
import { distance } from './math'
import type { GameRoom } from './room'
import { executeWorkerAdventure } from './workerCommands'
import { pickupRadius } from './worldPickup'

export function pickUpWorkerBrushwood(
    actor: GameCharacter,
    room: GameRoom,
    row: MarketRow | undefined,
    now: number
): void {
    if (!canCollectBrushwood(actor, row)) {
        return
    }
    const navigation = room.navigationFor(actor)
    const nearby = room
        .scenarioEnvironment(actor)
        .items.filter(
            (item) =>
                item.itemId === 'brushwood' &&
                distance(actor.position, item.position) <= pickupRadius &&
                navigation.hasLineOfSight(actor.position, item.position)
        )
        .sort(
            (a, b) =>
                distance(actor.position, a.position) -
                distance(actor.position, b.position)
        )
    for (const item of nearby) {
        const events = room.requestPickup(actor, item.id, now)
        room.publishEvents(events)
        if (events.some((event) => event.kind === 'item_pickup')) {
            return
        }
    }
}

/** Use a naturally reachable branch source while already working at the grove. */
export function gatherWorkerBrushwood(
    actor: GameCharacter,
    room: GameRoom,
    row: MarketRow | undefined,
    now: number
): boolean {
    if (!canCollectBrushwood(actor, row)) {
        return false
    }
    const service = room.adventureForWorkers()
    const navigation = room.navigationFor(actor)
    const node = service
        .resourceSnapshot(actor.locationId)
        .filter(
            (source) =>
                source.kind === 'brushwood' &&
                (source.source === 'bush' || source.source === 'branches') &&
                source.remaining > 0
        )
        .sort(
            (a, b) =>
                distance(actor.position, a.position) -
                distance(actor.position, b.position)
        )
        .find(
            (source) =>
                service.inspectGather(
                    actor,
                    source.id,
                    'harvest',
                    now,
                    navigation
                ).status === 'ready'
        )
    return (
        node !== undefined &&
        executeWorkerAdventure(
            actor,
            room,
            { type: 'gather', nodeId: node.id },
            now
        ).accepted
    )
}

function canCollectBrushwood(
    actor: GameCharacter,
    row: MarketRow | undefined
): boolean {
    return (
        row !== undefined &&
        row.stock + countInventoryItem(actor.inventory, 'brushwood') <
            row.capacity
    )
}
