import {
    INVENTORY_CAPACITY,
    ITEM_DEFINITIONS,
    type ItemId,
} from '@my-game-ratata/contracts'

import {
    createItemInstance,
    type InventoryItemInstance,
    itemQuantity,
} from './inventoryItems'

export type InventoryCosts = Partial<Record<ItemId, number>>

export function countInventoryItem(
    inventory: readonly InventoryItemInstance[],
    itemId: ItemId
): number {
    return inventory.reduce(
        (total, item) =>
            total + (item.itemId === itemId ? itemQuantity(item) : 0),
        0
    )
}

export function canAddInventoryItems(
    inventory: readonly InventoryItemInstance[],
    items: readonly InventoryItemInstance[],
    capacity = INVENTORY_CAPACITY
): boolean {
    return planAddition(inventory, items, capacity) !== undefined
}

/** Either every unit fits, or no destination stack is changed. */
export function addInventoryItems(
    inventory: InventoryItemInstance[],
    items: readonly InventoryItemInstance[],
    capacity = INVENTORY_CAPACITY
): boolean {
    const plan = planAddition(inventory, items, capacity)
    if (plan === undefined) {
        return false
    }
    commit(inventory, plan, items)
    return true
}

export function addInventoryItem(
    inventory: InventoryItemInstance[],
    item: InventoryItemInstance
): boolean {
    return addInventoryItems(inventory, [item])
}

export function consumeInventoryItems(
    inventory: InventoryItemInstance[],
    costs: InventoryCosts
): boolean {
    const plan = planConsumption(inventory, costs)
    if (plan === undefined) {
        return false
    }
    commit(inventory, plan)
    return true
}

/** Capacity is checked after consumption so crafting can reuse freed slots. */
export function craftInventoryItems(
    inventory: InventoryItemInstance[],
    costs: InventoryCosts,
    outputs: readonly InventoryItemInstance[]
): boolean {
    const consumed = planConsumption(inventory, costs)
    const plan =
        consumed === undefined
            ? undefined
            : planAddition(consumed, outputs, INVENTORY_CAPACITY)
    if (plan === undefined) {
        return false
    }
    commit(inventory, plan, outputs)
    return true
}

export function transferInventoryItem(
    source: InventoryItemInstance[],
    destination: InventoryItemInstance[],
    instanceId: string,
    capacity = INVENTORY_CAPACITY
): InventoryItemInstance | undefined {
    if (source === destination) {
        return undefined
    }
    const index = source.findIndex((item) => item.instanceId === instanceId)
    const item = source[index]
    if (
        item === undefined ||
        !addInventoryItems(destination, [item], capacity)
    ) {
        return undefined
    }
    source.splice(index, 1)
    return item
}

function validQuantity(item: InventoryItemInstance): boolean {
    const amount = itemQuantity(item)
    return Number.isSafeInteger(amount) && amount > 0
}

function validInventory(inventory: readonly InventoryItemInstance[]): boolean {
    const ids = new Set<string>()
    for (const item of inventory) {
        const definition = ITEM_DEFINITIONS[item.itemId]
        if (
            !Object.hasOwn(ITEM_DEFINITIONS, item.itemId) ||
            !validQuantity(item) ||
            itemQuantity(item) > (definition.maxStack ?? 1) ||
            ids.has(item.instanceId)
        ) {
            return false
        }
        ids.add(item.instanceId)
    }
    return true
}

function planAddition(
    inventory: readonly InventoryItemInstance[],
    items: readonly InventoryItemInstance[],
    capacity: number
): InventoryItemInstance[] | undefined {
    if (
        !(capacity === Infinity || Number.isSafeInteger(capacity)) ||
        capacity < inventory.length ||
        !validInventory(inventory)
    ) {
        return undefined
    }
    const plan = inventory.map((item) => ({ ...item }))
    const ids = new Set(plan.map((item) => item.instanceId))
    for (const item of items) {
        if (
            !validQuantity(item) ||
            !Object.hasOwn(ITEM_DEFINITIONS, item.itemId) ||
            ids.has(item.instanceId)
        ) {
            return undefined
        }
        ids.add(item.instanceId)
        if (!appendStack(plan, item, capacity)) {
            return undefined
        }
    }
    return plan
}

function appendStack(
    plan: InventoryItemInstance[],
    item: InventoryItemInstance,
    capacity: number
): boolean {
    const maxStack = ITEM_DEFINITIONS[item.itemId].maxStack ?? 1
    let remaining = itemQuantity(item)
    if (maxStack > 1) {
        for (const existing of plan) {
            if (existing.itemId !== item.itemId) {
                continue
            }
            const amount = Math.min(
                remaining,
                maxStack - itemQuantity(existing)
            )
            setQuantity(existing, itemQuantity(existing) + amount)
            remaining -= amount
            if (remaining === 0) {
                return true
            }
        }
    }
    const slots = Math.ceil(remaining / maxStack)
    if (plan.length + slots > capacity) {
        return false
    }
    for (let index = 0; index < slots; index += 1) {
        const quantity = Math.min(remaining, maxStack)
        plan.push({
            instanceId: index === 0 ? item.instanceId : '',
            itemId: item.itemId,
            ...(quantity === 1 ? {} : { quantity }),
        })
        remaining -= quantity
    }
    return true
}

function planConsumption(
    inventory: readonly InventoryItemInstance[],
    costs: InventoryCosts
): InventoryItemInstance[] | undefined {
    if (!validInventory(inventory)) {
        return undefined
    }
    const plan = inventory.map((item) => ({ ...item }))
    for (const [rawItemId, quantity] of Object.entries(costs)) {
        const itemId = rawItemId as ItemId
        if (
            !Object.hasOwn(ITEM_DEFINITIONS, itemId) ||
            !Number.isSafeInteger(quantity) ||
            quantity < 0 ||
            countInventoryItem(plan, itemId) < quantity
        ) {
            return undefined
        }
        consumeFromPlan(plan, itemId, quantity)
    }
    return plan
}

function consumeFromPlan(
    plan: InventoryItemInstance[],
    itemId: ItemId,
    quantity: number
): void {
    let remaining = quantity
    for (let index = 0; index < plan.length && remaining > 0;) {
        const item = plan[index]
        if (item === undefined) {
            break
        }
        if (item.itemId !== itemId) {
            index += 1
            continue
        }
        const taken = Math.min(remaining, itemQuantity(item))
        remaining -= taken
        if (taken === itemQuantity(item)) {
            plan.splice(index, 1)
        } else {
            setQuantity(item, itemQuantity(item) - taken)
            index += 1
        }
    }
}

function setQuantity(item: InventoryItemInstance, quantity: number): void {
    if (quantity === 1) {
        Reflect.deleteProperty(item, 'quantity')
    } else {
        item.quantity = quantity
    }
}

function commit(
    inventory: InventoryItemInstance[],
    plan: InventoryItemInstance[],
    inputs: readonly InventoryItemInstance[] = []
): void {
    const originals = new Map(
        [...inventory, ...inputs].map((item) => [item.instanceId, item])
    )
    const ids = new Set(plan.map((item) => item.instanceId))
    for (const item of plan) {
        if (item.instanceId !== '') {
            continue
        }
        let generated: InventoryItemInstance
        do {
            generated = createItemInstance(item.itemId)
        } while (ids.has(generated.instanceId))
        item.instanceId = generated.instanceId
        ids.add(item.instanceId)
    }
    const resolved = plan.map((item) => {
        const original = originals.get(item.instanceId)
        return original?.itemId === item.itemId &&
            itemQuantity(original) === itemQuantity(item)
            ? original
            : item
    })
    inventory.splice(0, inventory.length, ...resolved)
}
