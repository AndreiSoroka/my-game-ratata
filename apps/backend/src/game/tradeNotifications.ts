import type { ExchangeSnapshot } from '@my-game-ratata/contracts'

interface TradeView {
    refusal: string | undefined
    id: string
    status: string
    terms: string
    accepted: boolean
}
/** Only a partner's material proposal/consent wakes the model, never our own ack. */
export class TradeNotifications {
    private readonly views = new Map<string, TradeView>()
    public changed(actorId: string, exchange: ExchangeSnapshot): boolean {
        const view = {
            refusal: exchange.other.refusal?.id,
            id: exchange.id,
            status: exchange.status,
            terms: JSON.stringify([exchange.other.items, exchange.other.gold]),
            accepted: exchange.other.accepted,
        }
        const previous = this.views.get(actorId)
        this.views.set(actorId, view)
        return (
            previous?.id === view.id &&
            previous.status === 'active' &&
            view.status === 'active' &&
            (previous.terms !== view.terms ||
                (!previous.accepted && view.accepted) ||
                (view.refusal !== undefined &&
                    previous.refusal !== view.refusal))
        )
    }
}
