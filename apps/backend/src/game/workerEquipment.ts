import type { GameCharacter } from './character'
import type { InventoryItemInstance } from './inventory'

const issuedLumberjackEquipment = new WeakMap<
    GameCharacter,
    ReadonlySet<string>
>()

export function registerLumberjackEquipment(actor: GameCharacter): void {
    issuedLumberjackEquipment.set(
        actor,
        new Set(Object.values(actor.equipment).map((item) => item.instanceId))
    )
}

export function isIssuedLumberjackEquipment(
    actor: GameCharacter,
    item: InventoryItemInstance
): boolean {
    return issuedLumberjackEquipment.get(actor)?.has(item.instanceId) === true
}
