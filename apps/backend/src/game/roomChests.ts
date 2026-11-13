import type { ChestClientMessage } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { WorldLocations } from './worldLocations'

export function createRoomChestActions(world: () => WorldLocations) {
    return {
        handle: (
            actor: GameCharacter,
            message: ChestClientMessage,
            now: number
        ) =>
            world()
                .get(actor.locationId)
                .inventory.containers.handle(actor, message, now),
        snapshot: (actor: GameCharacter, now: number) =>
            world()
                .get(actor.locationId)
                .inventory.containers.snapshot(actor, now),
    }
}
