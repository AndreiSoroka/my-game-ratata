import { describe, expect, it } from 'vitest'

import { parseAgentDecision } from '../src/game/agentDecisionParsing'
import { parseClientMessage } from '../src/game/messages'
const trade = {
    type: 'market_trade',
    npcId: 'npc_merchant_1',
    side: 'sell',
    itemId: 'wood',
    quantity: 2,
    expectedTotal: 7,
    requestId: 'trade-1',
}
describe('validated economy commands', () => {
    it('parses private orders and direct services without accepting malformed prices or IDs', () => {
        const order = {
            type: 'craft_order_place',
            npcId: 'npc_smith_1',
            itemId: 'stone_axe',
            expectedTotal: 10,
            requestId: 'order-request',
        }
        expect(parseAgentDecision(order)).toEqual(order)
        expect(parseClientMessage(JSON.stringify(order)).message).toEqual(order)
        expect(
            parseAgentDecision({ ...order, expectedTotal: 2.5 })
        ).toBeUndefined()
        expect(
            parseAgentDecision({ ...order, itemId: 'mint_gold' })
        ).toBeUndefined()
        expect(
            parseAgentDecision({
                type: 'craft_order_claim',
                npcId: 'npc_smith_1',
                orderId: 'one',
                expectedRemaining: 5,
                requestId: 'claim',
            })
        ).toMatchObject({ type: 'craft_order_claim', expectedRemaining: 5 })
        expect(
            parseAgentDecision({
                type: 'craft_order_cancel',
                npcId: 'npc_smith_1',
                orderId: '',
                requestId: 'cancel',
            })
        ).toBeUndefined()
        expect(
            parseAgentDecision({
                type: 'interact',
                targetId: 'npc_smith_1',
                service: 'orders',
            })
        ).toEqual({
            type: 'interact',
            targetId: 'npc_smith_1',
            service: 'orders',
        })
        expect(
            parseAgentDecision({
                type: 'interact',
                targetId: 'npc_smith_1',
                service: 'grant_free_items',
            })
        ).toBeUndefined()
    })
    it('uses the same market and planting inputs for players and agents', () => {
        expect(parseClientMessage(JSON.stringify(trade)).message).toEqual(trade)
        expect(parseAgentDecision(trade)).toEqual(trade)
        const plant = { type: 'plant_tree', position: { x: 512, y: 624 } }
        expect(parseAgentDecision(plant)).toEqual(plant)
        expect(
            parseAgentDecision({
                type: 'inventory_action',
                action: 'equip',
                itemInstanceId: 'axe-1',
            })
        ).toMatchObject({ type: 'inventory_action', action: 'equip' })
    })
    it('rejects forged types, fractional quantities, invalid totals and repeated repair IDs', () => {
        for (const change of [
            { itemId: 'old_sword' },
            { quantity: 1.5 },
            { quantity: -1 },
            { quantity: 101 },
            { expectedTotal: -2 },
            { expectedTotal: NaN },
            { requestId: '' },
        ]) {
            expect(
                parseClientMessage(JSON.stringify({ ...trade, ...change }))
                    .message
            ).toBeUndefined()
            expect(parseAgentDecision({ ...trade, ...change })).toBeUndefined()
        }
        expect(
            parseAgentDecision({
                type: 'repair_items',
                npcId: 'smith',
                instanceIds: ['same', 'same'],
                expectedTotal: 2,
                requestId: 'r',
            })
        ).toBeUndefined()
        expect(
            parseAgentDecision({
                type: 'plant_tree',
                position: { x: Infinity, y: 0 },
            })
        ).toBeUndefined()
    })
})
