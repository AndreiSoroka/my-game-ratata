import {
    isItemBroken,
    ITEM_DEFINITIONS,
    itemDurability,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { InventoryItemInstance } from './inventoryItems'

/** Returns true only on the transition into a broken condition. */
export function wearItem(item: InventoryItemInstance, amount: number): boolean {
    const current = itemDurability(item)
    if (
        current === undefined ||
        current <= 0 ||
        !Number.isSafeInteger(amount) ||
        amount <= 0
    ) {
        return false
    }
    item.durability = Math.max(0, current - amount)
    return item.durability === 0
}

/** Restores an owned item after the caller atomically validates and pays for service. */
export function repairItem(item: InventoryItemInstance): boolean {
    const maximum = ITEM_DEFINITIONS[item.itemId].maxDurability
    if (maximum === undefined || itemDurability(item) === maximum) {
        return false
    }
    item.durability = maximum
    delete item.wearDistance
    return true
}

export function wearWalkingEquipment(
    character: GameCharacter,
    traveled: number
): void {
    if (!Number.isFinite(traveled) || traveled <= 0) {
        return
    }
    for (const item of Object.values(character.equipment)) {
        const step = ITEM_DEFINITIONS[item.itemId].durabilityWear?.walkPixels
        if (step === undefined || isItemBroken(item)) {
            continue
        }
        const distance = (item.wearDistance ?? 0) + traveled
        // Roundoff at an exact boundary must not give different wear at different tick rates.
        const consumed = Math.floor((distance + 1e-9) / step)
        item.wearDistance = Math.max(0, distance - consumed * step)
        wearItem(item, consumed)
    }
}

export function wearHitEquipment(character: GameCharacter): void {
    for (const item of Object.values(character.equipment)) {
        wearItem(item, ITEM_DEFINITIONS[item.itemId].durabilityWear?.hit ?? 0)
    }
}

export function wearWeapon(character: GameCharacter): boolean {
    const item = character.equipment.weapon
    return item === undefined
        ? false
        : wearItem(
              item,
              ITEM_DEFINITIONS[item.itemId].durabilityWear?.attack ?? 0
          )
}
