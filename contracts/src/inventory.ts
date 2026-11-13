import type { ItemInstanceSnapshot } from './index'

export const INVENTORY_CAPACITY = 50

export const itemIds = [
    'boots',
    'food',
    'old_sword',
    'simple_sword',
    'slime_heart',
    'herbs',
    'fiber',
    'scrap',
    'wood',
    'grain',
] as const

export type ItemId = (typeof itemIds)[number]

export type EquipmentSlotId = 'boots' | 'weapon'

export type InventoryActionKind = 'drop' | 'eat' | 'equip' | 'stash'

export type EquipmentActionKind = 'unequip'

export interface ItemWeaponStats {
    maxDamage: number
    minDamage: number
}

export interface ItemStatBonuses {
    dodgeChance?: number
}

export interface ItemDefinition {
    maxStack?: number
    description?: string
    equipmentSlots?: readonly EquipmentSlotId[]
    healHp?: number
    id: ItemId
    name: string
    statBonuses?: ItemStatBonuses
    weapon?: ItemWeaponStats
}

export const ITEM_DEFINITIONS: Record<ItemId, ItemDefinition> = {
    herbs: {
        id: 'herbs',
        name: 'Лечебные травы',
        maxStack: 9,
        description: 'Материал для походной еды. До 9 единиц в ячейке.',
    },
    grain: {
        id: 'grain',
        name: 'Зерно',
        maxStack: 9,
        description: 'Собранная пшеница для хлеба. До 9 единиц в ячейке.',
    },
    fiber: {
        id: 'fiber',
        name: 'Волокно',
        maxStack: 1,
        description: 'Прочное растительное волокно для ремесла.',
    },
    scrap: {
        id: 'scrap',
        name: 'Металлический лом',
        maxStack: 1,
        description: 'Металл для изготовления оружия.',
    },
    wood: {
        id: 'wood',
        name: 'Древесина',
        maxStack: 1,
        description: 'Заготовка для ремесла. Занимает отдельную ячейку.',
    },
    slime_heart: {
        id: 'slime_heart',
        name: 'Слизневое сердце',
        description:
            'Сердце враждебного слизня. Принеси три Мире для колокола памяти.',
    },
    boots: {
        equipmentSlots: ['boots'],
        id: 'boots',
        name: 'Old Boots',
        statBonuses: {
            dodgeChance: 0.08,
        },
    },
    food: {
        healHp: 10,
        id: 'food',
        name: 'Apple',
    },
    old_sword: {
        equipmentSlots: ['weapon'],
        id: 'old_sword',
        name: 'Old Sword',
        weapon: {
            maxDamage: 6,
            minDamage: 3,
        },
    },
    simple_sword: {
        equipmentSlots: ['weapon'],
        id: 'simple_sword',
        name: 'Simple Sword',
        weapon: {
            maxDamage: 11,
            minDamage: 7,
        },
    },
}

/** Predicts whether the entire item fits; the server still validates transfers. */
export function canAcceptInventoryItem(
    inventory: readonly ItemInstanceSnapshot[],
    item: ItemInstanceSnapshot
): boolean {
    const quantity = item.quantity ?? 1
    const maxStack = ITEM_DEFINITIONS[item.itemId].maxStack ?? 1
    if (
        !Number.isSafeInteger(quantity) ||
        quantity <= 0 ||
        inventory.length > INVENTORY_CAPACITY
    ) {
        return false
    }
    let space = (INVENTORY_CAPACITY - inventory.length) * maxStack
    for (const existing of inventory) {
        if (!validStack(existing)) {
            return false
        }
        if (existing.itemId === item.itemId) {
            space += maxStack - (existing.quantity ?? 1)
        }
    }
    return quantity <= space
}

function validStack(item: ItemInstanceSnapshot): boolean {
    const amount = item.quantity ?? 1
    return (
        Number.isSafeInteger(amount) &&
        amount > 0 &&
        amount <= (ITEM_DEFINITIONS[item.itemId].maxStack ?? 1)
    )
}
