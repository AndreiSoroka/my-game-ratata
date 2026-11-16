import { isItemBroken } from '@my-game-ratata/contracts'

import { repairSnapshot } from './adventureTrading'
import type { GameCharacter } from './character'
import type { GameRoom } from './room'
import { approach } from './workerNavigation'

/** Returns the next ordinary decision delay while maintenance owns the policy. */
export function repairWorker(
    actor: GameCharacter,
    room: GameRoom,
    now: number,
    requestId: () => string
): number | undefined {
    if (!Object.values(actor.equipment).some(isItemBroken)) {
        return undefined
    }
    const smith = room.getCharacter('npc_smith_1')
    if (
        smith?.alive !== true ||
        !approach(actor, room, smith.locationId, smith.position)
    ) {
        return 500
    }
    const quote = repairSnapshot(actor)
    const result = room.requestAdventure(
        actor,
        {
            type: 'repair_items',
            npcId: smith.id,
            instanceIds: quote.items.map((item) => item.instanceId),
            expectedTotal: quote.total,
            requestId: requestId(),
        },
        now
    )
    room.publishEvents(result.events)
    return result.accepted ? 500 : 10_000
}
