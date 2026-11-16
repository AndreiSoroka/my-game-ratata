import type { GameCharacter } from './character'
import type { WorldLocations } from './worldLocations'

export function createRoomItemPicker(world: () => WorldLocations) {
    return (actor: GameCharacter, worldItemId?: string, now = Date.now()) =>
        world()
            .get(actor.locationId)
            .inventory.pickupItem(actor, worldItemId, now)
}
