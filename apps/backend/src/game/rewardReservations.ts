import type { ExchangeItemQuantity } from '@my-game-ratata/contracts'

import { type InventoryItemInstance, itemQuantity } from './inventoryItems'

export interface AssetWallet {
    gold: number
}
export interface RewardAssets {
    inventory: InventoryItemInstance[]
    wallet: AssetWallet
}
interface Reservation extends RewardAssets {
    gold: number
    items: ExchangeItemQuantity[]
}

const bags = new WeakMap<
    readonly InventoryItemInstance[],
    Map<string, ExchangeItemQuantity[]>
>()
const wallets = new WeakMap<AssetWallet, Map<string, number>>()

export function reservedInventoryQuantity(
    inventory: readonly InventoryItemInstance[],
    instanceId: string,
    exceptId?: string
): number {
    let total = 0
    for (const [id, items] of bags.get(inventory) ?? []) {
        if (id !== exceptId) {
            total +=
                items.find((item) => item.instanceId === instanceId)
                    ?.quantity ?? 0
        }
    }
    return total
}

export function availableInventoryQuantity(
    inventory: readonly InventoryItemInstance[],
    instanceId: string,
    exceptId?: string
): number {
    const item = inventory.find((entry) => entry.instanceId === instanceId)
    return Math.max(
        0,
        (item === undefined ? 0 : itemQuantity(item)) -
            reservedInventoryQuantity(inventory, instanceId, exceptId)
    )
}

export function availableGold(wallet: AssetWallet, exceptId?: string): number {
    let reserved = 0
    for (const [id, gold] of wallets.get(wallet) ?? []) {
        if (id !== exceptId) {
            reserved += gold
        }
    }
    return Math.max(0, wallet.gold - reserved)
}

/** A promise restricts voluntary spending, never theft or normal death loot. */
export class RewardReservations {
    private readonly entries = new Map<string, Reservation>()

    public reserve(
        id: string,
        assets: RewardAssets,
        gold: number,
        items: readonly ExchangeItemQuantity[]
    ): boolean {
        if (this.entries.has(id) || !validReward(assets, gold, items)) {
            return false
        }
        const reservation = {
            ...assets,
            gold,
            items: structuredClone([...items]),
        }
        this.entries.set(id, reservation)
        const bag =
            bags.get(assets.inventory) ??
            new Map<string, ExchangeItemQuantity[]>()
        bag.set(id, reservation.items)
        bags.set(assets.inventory, bag)
        const wallet = wallets.get(assets.wallet) ?? new Map<string, number>()
        wallet.set(id, gold)
        wallets.set(assets.wallet, wallet)
        return true
    }

    public valid(id: string): boolean {
        const entry = this.entries.get(id)
        return (
            entry !== undefined &&
            validReward(entry, entry.gold, entry.items, id)
        )
    }

    public release(id: string): boolean {
        const entry = this.entries.get(id)
        if (entry === undefined) {
            return false
        }
        bags.get(entry.inventory)?.delete(id)
        wallets.get(entry.wallet)?.delete(id)
        this.entries.delete(id)
        return true
    }
}

function validReward(
    assets: RewardAssets,
    gold: number,
    items: readonly ExchangeItemQuantity[],
    exceptId?: string
): boolean {
    return (
        Number.isSafeInteger(gold) &&
        gold >= 0 &&
        availableGold(assets.wallet, exceptId) >= gold &&
        new Set(items.map((item) => item.instanceId)).size === items.length &&
        items.every(
            (item) =>
                Number.isSafeInteger(item.quantity) &&
                item.quantity > 0 &&
                availableInventoryQuantity(
                    assets.inventory,
                    item.instanceId,
                    exceptId
                ) >= item.quantity
        )
    )
}
