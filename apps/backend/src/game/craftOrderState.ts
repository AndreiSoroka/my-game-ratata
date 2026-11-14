import {
    type CraftOrderSnapshot,
    type CraftOrderStatus,
    ITEM_DEFINITIONS,
    type ItemId,
    type MarketSnapshot,
    quoteMarketTrade,
    workshopFor,
} from '@my-game-ratata/contracts'

import { adventureRecipes } from './adventureResources'
import type { MarketResult } from './cityEconomy'
import type { CityState } from './cityEconomyStock'
import {
    addInventoryItems,
    countInventoryItem,
    type InventoryItemInstance,
} from './inventory'

export interface CustomerOrder {
    id: string
    ownerId: string
    npcId: string
    cityId: string
    itemId: ItemId
    status: CraftOrderStatus
    fullPrice: number
    deposit: number
    remaining: number
    createdAt: number
    started: boolean
    releaseAt?: number
    output?: InventoryItemInstance
}
export const activeCustomerOrder = (order: CustomerOrder): boolean =>
    ['waiting_materials', 'queued', 'ready'].includes(order.status)
export function orderSnapshot(order: CustomerOrder): CraftOrderSnapshot {
    return {
        id: order.id,
        npcId: order.npcId,
        itemId: order.itemId,
        label: ITEM_DEFINITIONS[order.itemId].name,
        status: order.status,
        fullPrice: order.fullPrice,
        deposit: order.deposit,
        remaining: order.remaining,
        createdAt: order.createdAt,
        ...(order.releaseAt === undefined
            ? {}
            : { releaseAt: order.releaseAt }),
    }
}
export function orderRecipe(
    order: Pick<CustomerOrder, 'npcId' | 'itemId'>,
    city: CityState | undefined
) {
    const workshop = workshopFor(order.npcId)
    if (city === undefined || workshop === undefined) {
        return undefined
    }
    return adventureRecipes.find(
        (recipe) =>
            recipe.itemId === order.itemId &&
            workshop.recipeIds.includes(recipe.id) &&
            Object.entries(recipe.cost).every(
                ([id, amount]) =>
                    countInventoryItem(city.inventory, id as ItemId) >= amount
            )
    )
}
export function orderPrice(
    market: MarketSnapshot | undefined,
    itemId: ItemId
): number | undefined {
    const row = market?.rows.find((candidate) => candidate.itemId === itemId)
    if (row === undefined) {
        return undefined
    }
    return (
        row.buyPrice ??
        quoteMarketTrade({ ...row, stock: 1 }, 'buy', 1) ??
        undefined
    )
}

export function releaseCustomerOrder(
    order: CustomerOrder,
    city: CityState | undefined,
    now: number
): void {
    if (city === undefined || order.output === undefined) {
        return
    }
    // A returned real item may exceed the procurement cap; it must never disappear.
    if (!addInventoryItems(city.inventory, [order.output], Infinity)) {
        return
    }
    city.revision += 1
    city.history.push({
        at: now,
        itemId: order.output
            .itemId as import('@my-game-ratata/contracts').MarketItemId,
        quantity: 1,
        kind: 'delivery',
    })
    delete order.output
    order.status = 'released'
}

export function reject(error: string): MarketResult {
    return { accepted: false, error }
}
export function ok(): MarketResult {
    return { accepted: true, error: null }
}
