import type {
    AdventureClientMessage,
    EquipmentActionClientMessage,
    InventoryActionClientMessage,
} from '@my-game-ratata/contracts'

import type { AdventureService } from './adventure'
import type { GameCharacter } from './character'
import type { NavigationService } from './navigation'
import type { WorldLocations } from './worldLocations'

export function createAdventureRequester(
    service: () => AdventureService,
    characters: () => GameCharacter[],
    navigation: (actor: GameCharacter) => NavigationService
) {
    return (
        actor: GameCharacter,
        message: AdventureClientMessage,
        now = Date.now()
    ) =>
        service().handleResult(
            actor,
            message,
            characters(),
            navigation(actor),
            now
        )
}
export function createInventoryRequester(world: () => WorldLocations) {
    return (
        actor: GameCharacter,
        message: InventoryActionClientMessage | EquipmentActionClientMessage,
        now: number
    ) => {
        const inventory = world().get(actor.locationId).inventory
        const before = JSON.stringify([
            actor.inventory,
            actor.equipment,
            actor.hp,
        ])
        const events =
            message.type === 'inventory_action'
                ? inventory.applyInventoryAction(
                      actor,
                      message.action,
                      message.itemInstanceId,
                      now
                  )
                : inventory.unequip(actor, message.slot, now)
        const accepted =
            before !==
            JSON.stringify([actor.inventory, actor.equipment, actor.hp])
        return {
            accepted,
            error: accepted ? null : 'Действие с предметом не выполнено.',
            events,
        }
    }
}
export function resourceOccupants(world: WorldLocations, locationId: string) {
    const inventory = world.get(locationId).inventory
    return [...inventory.snapshotChests(), ...inventory.snapshotItems()].map(
        ({ position }) => ({
            x: position.x - 8,
            y: position.y - 8,
            width: 16,
            height: 16,
        })
    )
}
