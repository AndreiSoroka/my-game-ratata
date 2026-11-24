import type { ItemInstanceSnapshot } from './index'
import { PORTABLE_LIGHT_ITEMS } from './portableLights'

export const INVENTORY_CAPACITY = 50

export const itemIds = [
    'boots',
    'food',
    'old_sword',
    'simple_sword',
    'slime_heart',
    'lich_heart',
    'bone',
    'herbs',
    'fiber',
    'scrap',
    'wood',
    'grain',
    'wheat_seed',
    'axe',
    'stone_axe',
    'pickaxe',
    'stone',
    'sapling',
    'brushwood',
    'torch',
    'lantern',
] as const

export type ItemId = (typeof itemIds)[number]

export const equipmentSlotIds = ['weapon', 'boots', 'light'] as const
export type EquipmentSlotId = (typeof equipmentSlotIds)[number]

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
    price?: number
    maxDurability?: number
    gathering?: Partial<
        Record<
            'tree' | 'stone' | 'bush',
            { energy: number; durationMs: number; wear: number }
        >
    >
    fullRepairPrice?: number
    durabilityWear?: {
        attack?: number
        walkPixels?: number
        hit?: number
    }
    statBonuses?: ItemStatBonuses
    weapon?: ItemWeaponStats
}

export const ITEM_DEFINITIONS: Record<ItemId, ItemDefinition> = {
    ...PORTABLE_LIGHT_ITEMS,
    lich_heart: {
        id: 'lich_heart',
        name: 'Сердце лича',
        maxStack: 1,
        description:
            'Сердце в пепельной печати. Связь держится, пока оно лежит в своём сундуке.',
    },
    bone: {
        id: 'bone',
        name: 'Кость',
        maxStack: 1,
        description:
            'Кость скелета. Подойдёт как доказательство для обращения работника.',
    },
    axe: {
        id: 'axe',
        name: 'Топор',
        description:
            'Рубит деревья с минимальным износом. Можно использовать в бою.',
        equipmentSlots: ['weapon'],
        price: 25,
        maxDurability: 1000,
        gathering: {
            tree: { energy: 5, durationMs: 2000, wear: 1 },
            bush: { energy: 1, durationMs: 400, wear: 1 },
        },
        fullRepairPrice: 10,
        durabilityWear: { attack: 5 },
        weapon: { minDamage: 4, maxDamage: 7 },
    },
    stone_axe: {
        id: 'stone_axe',
        name: 'Каменный топор',
        description:
            'Дешёвый топор: рубит дерево, но служит заметно меньше железного.',
        equipmentSlots: ['weapon'],
        price: 10,
        maxDurability: 100,
        fullRepairPrice: 4,
        durabilityWear: { attack: 5 },
        gathering: {
            tree: { energy: 5, durationMs: 2000, wear: 1 },
            bush: { energy: 1, durationMs: 400, wear: 1 },
        },
        weapon: { minDamage: 2, maxDamage: 4 },
    },
    pickaxe: {
        id: 'pickaxe',
        name: 'Кирка',
        description: 'Прочный инструмент для добычи камня.',
        equipmentSlots: ['weapon'],
        price: 25,
        maxDurability: 1000,
        gathering: { stone: { energy: 5, durationMs: 2000, wear: 1 } },
        fullRepairPrice: 10,
        durabilityWear: { attack: 5 },
        weapon: { minDamage: 3, maxDamage: 6 },
    },
    stone: {
        id: 'stone',
        name: 'Камень',
        maxStack: 1,
        description: 'Добытый камень. Занимает отдельную ячейку.',
    },
    brushwood: {
        id: 'brushwood',
        name: 'Хворост',
        maxStack: 9,
        price: 1,
        description:
            'Сухие ветки для растопки и городского отопления. До 9 единиц в ячейке.',
    },
    sapling: {
        id: 'sapling',
        name: 'Саженец',
        maxStack: 1,
        price: 3,
        description:
            'Посади на свободной земле, чтобы за 10 минут вырастить взрослое лесное дерево. Пень сначала нужно убрать.',
    },
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
    wheat_seed: {
        id: 'wheat_seed',
        name: 'Семена пшеницы',
        maxStack: 9,
        description:
            'Одно семя нужно для посева грядки пшеницы. Иногда встречаются в сундуках и выпадают с урожаем. До 9 единиц в ячейке.',
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
        price: 18,
        maxDurability: 1000,
        fullRepairPrice: 8,
        durabilityWear: { walkPixels: 960, hit: 1 },
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
        gathering: {
            tree: { energy: 10, durationMs: 4000, wear: 20 },
            bush: { energy: 2, durationMs: 600, wear: 1 },
        },
        equipmentSlots: ['weapon'],
        id: 'old_sword',
        name: 'Old Sword',
        price: 12,
        maxDurability: 200,
        fullRepairPrice: 5,
        durabilityWear: { attack: 1 },
        weapon: {
            maxDamage: 6,
            minDamage: 3,
        },
    },
    simple_sword: {
        gathering: {
            tree: { energy: 10, durationMs: 4000, wear: 20 },
            bush: { energy: 2, durationMs: 600, wear: 1 },
        },
        equipmentSlots: ['weapon'],
        id: 'simple_sword',
        name: 'Simple Sword',
        price: 25,
        maxDurability: 200,
        fullRepairPrice: 10,
        durabilityWear: { attack: 1 },
        weapon: {
            maxDamage: 11,
            minDamage: 7,
        },
    },
}

export type ItemCondition = Pick<ItemInstanceSnapshot, 'itemId' | 'durability'>

/** Legacy instances without condition start intact; non-equipment has no condition. */
export function itemDurability(item: ItemCondition): number | undefined {
    const maximum = ITEM_DEFINITIONS[item.itemId].maxDurability
    return maximum === undefined ? undefined : (item.durability ?? maximum)
}

export function isItemBroken(item: ItemCondition): boolean {
    return itemDurability(item) === 0
}

/** Full restoration quote; payment and service access remain server-authoritative. */
export function itemRepairPrice(item: ItemCondition): number {
    const definition = ITEM_DEFINITIONS[item.itemId]
    const current = itemDurability(item)
    if (
        current === undefined ||
        definition.maxDurability === undefined ||
        definition.fullRepairPrice === undefined ||
        current >= definition.maxDurability
    ) {
        return 0
    }
    return Math.max(
        1,
        Math.ceil(
            (definition.fullRepairPrice *
                (definition.maxDurability - current)) /
                definition.maxDurability
        )
    )
}

/** Predicts whether the entire item fits; the server still validates transfers. */
export function canAcceptInventoryItem(
    inventory: readonly ItemInstanceSnapshot[],
    item: ItemInstanceSnapshot,
    capacity = INVENTORY_CAPACITY
): boolean {
    const quantity = item.quantity ?? 1
    const maxStack = ITEM_DEFINITIONS[item.itemId].maxStack ?? 1
    if (
        !Number.isSafeInteger(quantity) ||
        quantity <= 0 ||
        inventory.length > capacity
    ) {
        return false
    }
    let space = (capacity - inventory.length) * maxStack
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
