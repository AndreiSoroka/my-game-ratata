import type { ItemId } from '@my-game-ratata/contracts'

import { itemName } from '@/shared/lib/i18n'

export function itemStackLabel(item: { itemId: ItemId; quantity?: number }): string {
    const quantity = item.quantity ?? 1
    const name = itemName(item.itemId)
    return quantity > 1 ? `${name} × ${String(quantity)}` : name
}
