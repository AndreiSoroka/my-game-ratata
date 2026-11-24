import {
    type AdventureSnapshot,
    type AdventureTradeItemId,
    type ClientMessage,
    quoteMarketTrade,
} from '@my-game-ratata/contracts'

import type { MarketTradeSelection, WorkshopOrderAction } from '@/entities/shops'
import { createRandomId } from '@/shared/lib/random-id'

export function createAdventureServiceCommands(
    readAdventure: () => AdventureSnapshot,
    send: (message: ClientMessage) => void
) {
    return {
        trade(selection: AdventureTradeItemId | MarketTradeSelection): void {
            const { dialogue, market } = readAdventure()
            if (!dialogue?.canTrade || dialogue.tradeBlockedReason) return
            if (typeof selection === 'string') send({ type: 'trade', itemId: selection })
            else if (market) {
                send({
                    type: 'market_trade',
                    npcId: dialogue.npcId,
                    ...selection,
                    requestId: createRandomId(),
                })
            }
        },
        repair(instanceIds: string[], expectedTotal: number): void {
            const { dialogue, repairs } = readAdventure()
            if (!instanceIds.length || !dialogue || dialogue.tradeBlockedReason || !repairs) return
            send({
                type: 'repair_items',
                npcId: repairs.npcId,
                instanceIds,
                expectedTotal,
                requestId: createRandomId(),
            })
        },
        workshopOrder(action: WorkshopOrderAction): void {
            const { dialogue, workshop, market, gold } = readAdventure()
            if (!dialogue || dialogue.tradeBlockedReason || !workshop) return
            const request = { npcId: workshop.npcId, requestId: createRandomId() }
            switch (action.kind) {
                case 'buy': {
                    const row = market?.rows.find((row) => row.itemId === action.itemId)
                    if (!row) return
                    const expectedTotal = quoteMarketTrade(row, 'buy', 1)
                    if (expectedTotal === null || gold < expectedTotal) return
                    send({
                        ...request,
                        type: 'market_trade',
                        side: 'buy',
                        itemId: row.itemId,
                        quantity: 1,
                        expectedTotal,
                    })
                    break
                }
                case 'place':
                    send({
                        ...request,
                        type: 'craft_order_place',
                        itemId: action.itemId,
                        expectedTotal: action.expectedTotal,
                    })
                    break
                case 'claim':
                    send({
                        ...request,
                        type: 'craft_order_claim',
                        orderId: action.orderId,
                        expectedRemaining: action.expectedRemaining,
                    })
                    break
                case 'cancel':
                    send({ ...request, type: 'craft_order_cancel', orderId: action.orderId })
            }
        },
    }
}
