import type { ItemInstanceSnapshot } from './index'

export interface ExchangeItemQuantity {
    instanceId: string
    quantity: number
}

export type ExchangeClientMessage =
    | { type: 'exchange_invite'; targetId: string }
    | { type: 'exchange_answer'; exchangeId: string; accept: boolean }
    | {
          type: 'exchange_offer'
          exchangeId: string
          revision: number
          requestId?: string
          items: ExchangeItemQuantity[]
          gold: number
      }
    | { type: 'exchange_accept'; exchangeId: string; revision: number }
    | { type: 'exchange_cancel'; exchangeId: string }
    | {
          type: 'exchange_decline'
          exchangeId: string
          revision: number
          reason: string
      }

export interface ExchangeOfferSnapshot {
    refusal?: { id: string; reason: string }
    revision?: number
    lastRequestId?: string
    requestError?: string
    items: ItemInstanceSnapshot[]
    gold: number
    accepted: boolean
}

export interface ExchangeSnapshot {
    ownAvailability?: { gold: number; items: ExchangeItemQuantity[] }
    id: string
    revision: number
    status: 'invited' | 'active' | 'completed' | 'cancelled'
    partnerId: string
    partnerName: string
    incoming: boolean
    own: ExchangeOfferSnapshot
    other: ExchangeOfferSnapshot
    receiptId?: string
    notice?: string
}
