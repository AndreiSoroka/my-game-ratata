import type { MarketItemId } from '@my-game-ratata/contracts'

import {
    addInventoryItems,
    countInventoryItem,
    createItemInstance,
    type InventoryItemInstance,
    itemQuantity,
} from './inventory'
export const periodMs = 600_000
export interface CityCommodityDefinition {
    itemId: MarketItemId
    basePrice: number
    target: number
    consumption: number
    fixedPrice?: boolean
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
    revision: number
    history: StockEvent[]
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
    const sourcePlan = source.map((item) => ({ ...item }))
    const destinationPlan = destination.map((item) => ({ ...item }))
    const moved = takeQuantity(sourcePlan, itemId, quantity)
    if (!addInventoryItems(destinationPlan, moved, capacity)) {
        return false
    }
    source.splice(0, source.length, ...sourcePlan)
    destination.splice(0, destination.length, ...destinationPlan)
    return true
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
