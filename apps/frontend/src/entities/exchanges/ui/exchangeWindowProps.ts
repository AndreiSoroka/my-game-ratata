import type { ExchangeSnapshot } from '@my-game-ratata/contracts'

import type { ExchangePrimitives } from './exchangePrimitives'

export interface ExchangeDraftPresentation {
    readonly editing: boolean
    readonly withdrawing: boolean
    readonly confirming: boolean
    readonly error: string
    readonly valid: boolean
    readonly pending: boolean
    readonly dirty: boolean
    readonly empty: boolean
    readonly canConfirm: boolean
}

export interface ExchangeWindowProps {
    readonly exchange: Pick<ExchangeSnapshot, 'partnerName' | 'status' | 'notice' | 'own' | 'other'>
    readonly draft: ExchangeDraftPresentation
    readonly partnerAvailable?: boolean
    readonly primitives: ExchangePrimitives
}
