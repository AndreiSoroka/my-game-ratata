import { ITEM_DEFINITIONS, type ItemId } from '@my-game-ratata/contracts'

export function itemStackLabel(item: { itemId: ItemId; quantity?: number }): string {
    const quantity = item.quantity ?? 1
    const name = ITEM_DEFINITIONS[item.itemId].name
    return quantity > 1 ? `${name} × ${String(quantity)}` : name
}
