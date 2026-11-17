import {
    type ExchangeItemQuantity,
    INVENTORY_CAPACITY,
} from '@my-game-ratata/contracts'

import {
    createItemInstance,
    type InventoryItemInstance,
    itemQuantity,
} from './inventoryItems'
import { addInventoryItems } from './inventoryStacks'
import {
    type AssetWallet,
    availableGold,
    reservedInventoryQuantity,
} from './rewardReservations'

export interface AssetSettlementRequest {
    items: Array<{
        from: InventoryItemInstance[]
        to: InventoryItemInstance[]
        items: readonly ExchangeItemQuantity[]
        capacity?: number
    }>
    gold: Array<{ from: AssetWallet; to: AssetWallet; amount: number }>
    reservationId?: string
}
interface PlannedBag {
    original: InventoryItemInstance[]
    plan: InventoryItemInstance[]
    signature: string
    capacity: number
}
interface PlannedWallet {
    original: AssetWallet
    before: number
    after: number
}

/** Prepare every removal before additions; commit has no partial side effects. */
export function planAssetSettlement(
    request: AssetSettlementRequest
): { commit(): boolean } | undefined {
    const bags = collectBags(request)
    const incoming = detachItems(request, bags)
    const wallets = planWallets(request)
    if (incoming === undefined || wallets === undefined) {
        return undefined
    }
    for (const { bag, items } of incoming) {
        if (!addInventoryItems(bag.plan, items, bag.capacity)) {
            return undefined
        }
    }
    let committed = false
    return {
        commit: () => {
            if (committed || !unchanged(bags, wallets)) {
                return false
            }
            committed = true
            for (const bag of bags.values()) {
                bag.original.splice(0, bag.original.length, ...bag.plan)
            }
            for (const wallet of wallets.values()) {
                wallet.original.gold = wallet.after
            }
            return true
        },
    }
}

function collectBags(request: AssetSettlementRequest) {
    const bags = new Map<InventoryItemInstance[], PlannedBag>()
    for (const transfer of request.items) {
        for (const original of [transfer.from, transfer.to]) {
            if (!bags.has(original)) {
                bags.set(original, {
                    original,
                    plan: original.map((item) => ({ ...item })),
                    signature: JSON.stringify(original),
                    capacity: INVENTORY_CAPACITY,
                })
            }
        }
        const destination = bags.get(transfer.to)
        if (destination !== undefined && transfer.capacity !== undefined) {
            destination.capacity = transfer.capacity
        }
    }
    return bags
}

function detachItems(
    request: AssetSettlementRequest,
    bags: Map<InventoryItemInstance[], PlannedBag>
) {
    const incoming: Array<{ bag: PlannedBag; items: InventoryItemInstance[] }> =
        []
    for (const transfer of request.items) {
        const from = bags.get(transfer.from)
        const to = bags.get(transfer.to)
        if (from === undefined || to === undefined || from === to) {
            return undefined
        }
        const items: InventoryItemInstance[] = []
        for (const selected of transfer.items) {
            const portion = detachPortion(from, selected, request.reservationId)
            if (portion === undefined) {
                return undefined
            }
            items.push(portion)
        }
        incoming.push({ bag: to, items })
    }
    return incoming
}

function detachPortion(
    bag: PlannedBag,
    selected: ExchangeItemQuantity,
    exceptId?: string
): InventoryItemInstance | undefined {
    const index = bag.plan.findIndex(
        (item) => item.instanceId === selected.instanceId
    )
    const item = bag.plan[index]
    if (
        item === undefined ||
        !Number.isSafeInteger(selected.quantity) ||
        selected.quantity < 1
    ) {
        return undefined
    }
    const remaining = itemQuantity(item) - selected.quantity
    if (
        remaining <
        reservedInventoryQuantity(bag.original, item.instanceId, exceptId)
    ) {
        return undefined
    }
    const portion = { ...item, quantity: selected.quantity }
    if (remaining === 0) {
        bag.plan.splice(index, 1)
    } else {
        item.quantity = remaining
        portion.instanceId = createItemInstance(item.itemId).instanceId
    }
    if (portion.quantity === 1) {
        Reflect.deleteProperty(portion, 'quantity')
    }
    if (remaining === 1) {
        Reflect.deleteProperty(item, 'quantity')
    }
    return portion
}

function planWallets(request: AssetSettlementRequest) {
    const wallets = new Map<AssetWallet, PlannedWallet>()
    const outgoing = new Map<AssetWallet, number>()
    for (const transfer of request.gold) {
        if (
            !Number.isSafeInteger(transfer.amount) ||
            transfer.amount < 0 ||
            transfer.from === transfer.to
        ) {
            return undefined
        }
        for (const original of [transfer.from, transfer.to]) {
            if (!wallets.has(original)) {
                wallets.set(original, {
                    original,
                    before: original.gold,
                    after: original.gold,
                })
            }
        }
        outgoing.set(
            transfer.from,
            totalOutgoing(outgoing, transfer.from, transfer.amount)
        )
        const from = wallets.get(transfer.from)
        const to = wallets.get(transfer.to)
        if (from !== undefined && to !== undefined) {
            from.after -= transfer.amount
            to.after += transfer.amount
        }
    }
    for (const [wallet, amount] of outgoing) {
        if (amount > availableGold(wallet, request.reservationId)) {
            return undefined
        }
    }
    return [...wallets.values()].some(
        (wallet) => !Number.isSafeInteger(wallet.after) || wallet.after < 0
    )
        ? undefined
        : wallets
}

function unchanged(
    bags: Map<InventoryItemInstance[], PlannedBag>,
    wallets: Map<AssetWallet, PlannedWallet>
): boolean {
    return (
        [...bags.values()].every(
            (bag) => JSON.stringify(bag.original) === bag.signature
        ) &&
        [...wallets.values()].every(
            (wallet) => wallet.original.gold === wallet.before
        )
    )
}

function totalOutgoing(
    outgoing: Map<AssetWallet, number>,
    wallet: AssetWallet,
    amount: number
): number {
    return (outgoing.get(wallet) ?? 0) + amount
}
