import type { ExchangeSnapshot, ItemInstanceSnapshot } from '@my-game-ratata/contracts'

export interface ExchangeDraftQuantity {
    readonly available: number
    readonly selected: number
}

export interface ExchangeDraftItem extends ExchangeDraftQuantity {
    readonly item: ItemInstanceSnapshot
}

export interface ExchangeDraftOffer {
    readonly items: readonly ExchangeDraftItem[]
    readonly gold: ExchangeDraftQuantity
    readonly dirty: boolean
    readonly valid: boolean
    readonly pending: boolean
    readonly canResubmit: boolean
    readonly error: string
}

export interface ExchangeDraftPresentation extends ExchangeDraftOffer {
    readonly editing: boolean
    readonly withdrawing: boolean
    readonly confirming: boolean
    readonly empty: boolean
    readonly canConfirm: boolean
}

export interface ExchangeWindowProps {
    readonly exchange: Pick<ExchangeSnapshot, 'partnerName' | 'status' | 'notice' | 'own' | 'other'>
    readonly draft: ExchangeDraftPresentation
    readonly partnerAvailable?: boolean
}
