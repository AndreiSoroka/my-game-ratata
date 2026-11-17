import type { MarketItemId } from '@my-game-ratata/contracts'

import { planAssetSettlement } from './assetSettlement'
import {
    countInventoryItem,
    createItemInstance,
    type InventoryItemInstance,
    itemQuantity,
} from './inventory'
import { availableInventoryQuantity } from './rewardReservations'
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
