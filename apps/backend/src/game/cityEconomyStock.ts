import {
    type ItemId,
    type MarketItemId,
    PORTABLE_LIGHT_ITEMS,
} from '@my-game-ratata/contracts'

import { planAssetSettlement } from './assetSettlement'
import {
    addInventoryItems,
    countInventoryItem,
    createItemInstance,
    type InventoryItemInstance,
    itemQuantity,
} from './inventory'
import {
    availableInventoryQuantity,
    availableItemQuantity,
} from './rewardReservations'
export const periodMs = 600_000
export interface CityCommodityDefinition {
    itemId: MarketItemId
    basePrice: number
    target: number
    consumption: number
    fixedPrice?: boolean
    replenishment?: number
}
export const CITY_COMMODITIES: readonly CityCommodityDefinition[] = [
    {
        itemId: 'stone_axe',
        basePrice: 10,
        target: 6,
        consumption: 0,
        fixedPrice: true,
    },
    { itemId: 'wood', basePrice: 4, target: 12, consumption: 2 },
    { itemId: 'brushwood', basePrice: 1, target: 12, consumption: 1 },
    { itemId: 'stone', basePrice: 4, target: 6, consumption: 1 },
    { itemId: 'scrap', basePrice: 3, target: 6, consumption: 1 },
    { itemId: 'fiber', basePrice: 3, target: 6, consumption: 1 },
    { itemId: 'herbs', basePrice: 1, target: 12, consumption: 2 },
    { itemId: 'grain', basePrice: 1, target: 12, consumption: 2 },
    { itemId: 'wheat_seed', basePrice: 1, target: 12, consumption: 0 },
    { itemId: 'food', basePrice: 4, target: 24, consumption: 4 },
    { itemId: 'sapling', basePrice: 1, target: 12, consumption: 0 },
    {
        itemId: 'simple_sword',
        basePrice: 25,
        target: 6,
        consumption: 0,
        fixedPrice: true,
    },
    {
        itemId: 'boots',
        basePrice: 18,
        target: 6,
        consumption: 0,
        fixedPrice: true,
    },
    {
        itemId: 'axe',
        basePrice: 25,
        target: 6,
        consumption: 0,
        fixedPrice: true,
    },
    {
        itemId: 'pickaxe',
        basePrice: 25,
        target: 6,
        consumption: 0,
        fixedPrice: true,
    },
    {
        itemId: 'torch',
        basePrice: PORTABLE_LIGHT_ITEMS.torch.price,
        target: 24,
        consumption: 0,
        replenishment: 2,
        fixedPrice: true,
    },
    {
        itemId: 'lantern',
        basePrice: PORTABLE_LIGHT_ITEMS.lantern.price,
        target: 12,
        consumption: 0,
        replenishment: 1,
        fixedPrice: true,
    },
]

export interface StockEvent {
    at: number
    itemId: MarketItemId
    quantity: number
    kind: 'delivery' | 'consumption'
}
export interface CityState {
    inventory: InventoryItemInstance[]
    lastConsumptionAt: Map<MarketItemId, number>
    lastDeliveryAt: Map<MarketItemId, number>
    revision: number
    history: StockEvent[]
}

export function lumberjackStockTarget(capacity: number): number {
    return Math.ceil(capacity * 0.8)
}

export function depositStockSupplies(
    source: InventoryItemInstance[],
    city: CityState,
    supplier: 'herbalist' | 'lumberjack',
    now: number
): boolean {
    const items: MarketItemId[] =
        supplier === 'lumberjack' ? ['wood', 'brushwood'] : ['herbs']
    let deposited = false
    for (const itemId of items) {
        const definition = CITY_COMMODITIES.find(
            (entry) => entry.itemId === itemId
        )
        if (definition === undefined) {
            continue
        }
        const capacity = definition.target * 2
        const limit =
            itemId === 'wood' ? lumberjackStockTarget(capacity) : capacity
        const quantity = Math.min(
            availableItemQuantity(source, itemId),
            limit - countInventoryItem(city.inventory, itemId)
        )
        if (
            quantity > 0 &&
            transferQuantity(source, city.inventory, itemId, quantity, Infinity)
        ) {
            recordStockDelivery(city, itemId, quantity, now)
            deposited = true
        }
    }
    return deposited
}

export function recordStockDelivery(
    city: CityState,
    itemId: MarketItemId,
    quantity: number,
    at: number
): void {
    city.revision += 1
    city.history.push({ at, itemId, quantity, kind: 'delivery' })
}

export function recordWarehouseDelivery(
    city: CityState,
    itemId: ItemId,
    quantity: number,
    at: number
): void {
    const definition = CITY_COMMODITIES.find((row) => row.itemId === itemId)
    if (definition !== undefined) {
        recordStockDelivery(city, definition.itemId, quantity, at)
    }
}

export function transferQuantity(
    source: InventoryItemInstance[],
    destination: InventoryItemInstance[],
    itemId: MarketItemId,
    quantity: number,
    capacity?: number
): boolean {
    if (
        !Number.isSafeInteger(quantity) ||
        quantity <= 0 ||
        countInventoryItem(source, itemId) < quantity
    ) {
        return false
    }
    let remaining = quantity
    const items = []
    for (const item of source) {
        const amount =
            item.itemId === itemId
                ? Math.min(
                      remaining,
                      availableInventoryQuantity(source, item.instanceId)
                  )
                : 0
        if (amount > 0) {
            items.push({ instanceId: item.instanceId, quantity: amount })
            remaining -= amount
        }
    }
    return (
        remaining === 0 &&
        planAssetSettlement({
            items: [
                {
                    from: source,
                    to: destination,
                    items,
                    ...(capacity === undefined ? {} : { capacity }),
                },
            ],
            gold: [],
        })?.commit() === true
    )
}

export function takeQuantity(
    inventory: InventoryItemInstance[],
    itemId: MarketItemId,
    quantity: number
): InventoryItemInstance[] {
    const output: InventoryItemInstance[] = []
    let remaining = quantity
    for (let index = 0; index < inventory.length && remaining > 0;) {
        const item = inventory[index]
        if (item === undefined) {
            break
        }
        if (item.itemId !== itemId) {
            index += 1
            continue
        }
        const amount = Math.min(remaining, itemQuantity(item))
        remaining -= amount
        if (amount === itemQuantity(item)) {
            output.push(item)
            inventory.splice(index, 1)
        } else {
            item.quantity = itemQuantity(item) - amount
            output.push(createItemInstance(itemId, amount))
            index += 1
        }
    }
    return output
}

export function replenishStock(
    city: CityState,
    definition: CityCommodityDefinition,
    now: number
): void {
    const { itemId, replenishment, target } = definition
    const previous = city.lastDeliveryAt.get(itemId)
    if (previous === undefined || replenishment === undefined) {
        return
    }
    const intervals = Math.floor((now - previous) / periodMs)
    if (intervals <= 0) {
        return
    }
    const at = previous + intervals * periodMs
    const stock = countInventoryItem(city.inventory, itemId)
    const availableSpace = target - stock
    const quantity = Math.min(availableSpace, intervals * replenishment)
    if (
        quantity > 0 &&
        !addInventoryItems(
            city.inventory,
            [createItemInstance(itemId, quantity)],
            Infinity
        )
    ) {
        return
    }
    city.lastDeliveryAt.set(itemId, at)
    if (quantity <= 0) {
        return
    }
    city.revision += 1
    const deliveredAtLastInterval =
        quantity - Math.min(availableSpace, (intervals - 1) * replenishment)
    if (deliveredAtLastInterval > 0) {
        city.history.push({
            at,
            itemId,
            kind: 'delivery',
            quantity: deliveredAtLastInterval,
        })
    }
}
