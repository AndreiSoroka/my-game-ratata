import type { GameCharacter } from './character'
import type { WorldLocations } from './worldLocations'

export function createRoomItemPicker(
    world: () => WorldLocations,
    clock = Date.now
) {
    return (actor: GameCharacter, worldItemId?: string, now = clock()) =>
        world()
            .get(actor.locationId)
            .inventory.pickupItem(actor, worldItemId, now)
}
