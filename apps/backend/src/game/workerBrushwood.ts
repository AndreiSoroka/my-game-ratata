import {
    type AdventureResourceNode,
    CENTER_LOCATION_ID,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { distance } from './math'
import { resourceApproach, resourceReachable } from './resourcePlacement'
import type { GameRoom } from './room'
import { stop } from './workerNavigation'

/** A separate work budget; incidental tree drops never spend it. */
export class WorkerBrushwood {
    private nextWorkAt = 0

    public update(actor: GameCharacter, room: GameRoom, now: number): void {
        const service = room.adventureForWorkers()
        const stock = service.economy
            .snapshot(CENTER_LOCATION_ID, now)
            ?.rows.find((row) => row.itemId === 'brushwood')
        if (
            now < this.nextWorkAt ||
            stock === undefined ||
            stock.stock >= stock.target
        ) {
            stop(actor)
            return
        }
        const navigation = room.navigationFor(actor)
        const candidates = service
            .resourceSnapshot(actor.locationId)
            .filter((node) => readyNearby(actor, node))
            .sort(
                (a, b) =>
                    distance(actor.position, a.position) -
                    distance(actor.position, b.position)
            )
        for (const node of candidates) {
            const bounds = node.bounds
            if (
                bounds === undefined ||
                service.inspectGather(
                    actor,
                    node.id,
                    'harvest',
                    now,
                    navigation
                ).status === 'stop'
            ) {
                continue
            }
            const approach = resourceApproach(actor, bounds, navigation, 160)
            if (approach === undefined) {
                continue
            }
            if (!resourceReachable(actor, bounds, navigation)) {
                actor.setPath(
                    navigation.findPathWorld(actor.position, approach)
                )
                return
            }
            stop(actor)
            const result = room.requestAdventure(
                actor,
                { type: 'gather', nodeId: node.id },
                now
            )
            room.publishEvents(result.events)
            if (result.accepted) {
                this.nextWorkAt = now + 600_000
            }
            return
        }
        stop(actor)
    }
}

function readyNearby(
    actor: GameCharacter,
    node: AdventureResourceNode
): boolean {
    return (
        (node.source === 'bush' || node.source === 'branches') &&
        node.phase === 'ready' &&
        node.remaining > 0 &&
        node.bounds !== undefined &&
        distance(actor.position, node.position) <= 160
    )
}
