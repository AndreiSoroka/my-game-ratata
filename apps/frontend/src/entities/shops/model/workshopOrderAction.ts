import type { ItemId } from '@my-game-ratata/contracts'

export type WorkshopOrderAction =
    | { kind: 'buy'; itemId: ItemId }
    | { kind: 'place'; itemId: ItemId; expectedTotal: number }
    | { kind: 'claim'; orderId: string; expectedRemaining: number }
    | { kind: 'cancel'; orderId: string }
