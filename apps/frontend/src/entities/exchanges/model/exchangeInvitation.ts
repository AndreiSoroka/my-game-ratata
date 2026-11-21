import type { ExchangeSnapshot } from '@my-game-ratata/contracts'

export type ExchangeInvitationSnapshot = Pick<
    ExchangeSnapshot,
    'id' | 'status' | 'partnerName' | 'incoming'
>

export type ExchangeInvitationDirection = 'incoming' | 'outgoing'

interface ExchangeInvitation {
    id: string
    partnerName: string
    direction: ExchangeInvitationDirection
}

export function projectExchangeInvitation(
    exchange: ExchangeInvitationSnapshot | null | undefined
): ExchangeInvitation | undefined {
    if (exchange?.status !== 'invited') return undefined
    return {
        id: exchange.id,
        partnerName: exchange.partnerName,
        direction: exchange.incoming ? 'incoming' : 'outgoing',
    }
}
