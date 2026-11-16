import type { InventoryItemInstance } from './inventory'
import { itemQuantity } from './inventory'

/** Tracks only units actually acquired by this run; losses consume those units first. */
export class ScenarioLedger {
    private readonly earned = new Map<string, number>()
    private quantities = new Map<string, number>()
    public constructor(inventory: readonly InventoryItemInstance[]) {
        this.quantities = counts(inventory)
    }
    public reconcile(inventory: readonly InventoryItemInstance[]): void {
        const next = counts(inventory)
        for (const [id, quantity] of this.quantities) {
            const lost = Math.max(0, quantity - (next.get(id) ?? 0))
            this.earned.set(id, Math.max(0, (this.earned.get(id) ?? 0) - lost))
        }
        this.quantities = next
    }
    public acquired(
        before: readonly InventoryItemInstance[],
        after: readonly InventoryItemInstance[]
    ): void {
        const previous = counts(before)
        for (const item of after) {
            const gain = Math.max(
                0,
                itemQuantity(item) - (previous.get(item.instanceId) ?? 0)
            )
            if (gain > 0) {
                this.earned.set(
                    item.instanceId,
                    (this.earned.get(item.instanceId) ?? 0) + gain
                )
            }
        }
        this.quantities = counts(after)
    }
    public quantity(item: InventoryItemInstance): number {
        return Math.min(
            itemQuantity(item),
            this.earned.get(item.instanceId) ?? 0
        )
    }
}
function counts(items: readonly InventoryItemInstance[]): Map<string, number> {
    return new Map(items.map((item) => [item.instanceId, itemQuantity(item)]))
}
