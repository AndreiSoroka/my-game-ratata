import type { MarketSnapshot, WorkshopSnapshot } from '@my-game-ratata/contracts'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { adventureFixture } from '../testing/characterFixture'
import AdventureDialogue from './AdventureDialogue.vue'

const workshop: WorkshopSnapshot = {
    npcId: 'npc_smith_1',
    offers: [
        {
            itemId: 'axe',
            label: 'Топор',
            stock: 0,
            fullPrice: 25,
            deposit: 13,
            remaining: 12,
            canOrder: true,
        },
    ],
    orders: [],
}

function openWorkshop(snapshot: WorkshopSnapshot, gold: number, market?: MarketSnapshot) {
    return mount(AdventureDialogue, {
        props: {
            characters: [],
            adventure: {
                ...adventureFixture(gold),
                dialogue: {
                    npcId: snapshot.npcId,
                    npcName: 'Кузнец',
                    title: 'Мастерская',
                    text: '',
                    canTrade: true,
                    choices: [],
                    initialView: 'orders',
                },
                workshop: snapshot,
                ...(market && { market }),
            },
        },
    })
}

describe('workshop order payment', () => {
    it('uses the current market quote to buy an item in stock', async () => {
        const wrapper = openWorkshop(
            { ...workshop, offers: [{ ...workshop.offers[0]!, stock: 1, canOrder: false }] },
            40,
            {
                cityId: 'map-2-2',
                cityName: 'Новогород',
                revision: 1,
                rows: [
                    {
                        itemId: 'axe',
                        label: 'Топор',
                        stock: 1,
                        target: 4,
                        capacity: 8,
                        basePrice: 30,
                        fixedPrice: true,
                        buyPrice: 30,
                        sellPrice: 15,
                        consumptionPer10Minutes: 0,
                        deliveredLast10Minutes: 0,
                        consumedLast10Minutes: 0,
                    },
                ],
            }
        )
        await wrapper.get('.workshop-orders button').trigger('click')
        expect(wrapper.emitted('command')?.[0]?.[0]).toMatchObject({
            type: 'market_trade',
            npcId: 'npc_smith_1',
            itemId: 'axe',
            side: 'buy',
            quantity: 1,
            expectedTotal: 30,
        })
        wrapper.unmount()
    })

    it('discloses nonrefundable split before placing the order', async () => {
        const wrapper = openWorkshop(workshop, 20)
        await wrapper.get('.workshop-orders button').trigger('click')
        expect(wrapper.emitted('command')).toBeUndefined()
        expect(wrapper.get('.order-confirm').text()).toContain('сейчас 13')
        expect(wrapper.get('.order-confirm').text()).toContain('при получении 12')
        expect(wrapper.get('.order-confirm').text()).toContain('Аванс не возвращается')
        await wrapper.get('.order-confirm button').trigger('click')
        expect(wrapper.emitted('command')?.[0]?.[0]).toMatchObject({
            type: 'craft_order_place',
            npcId: 'npc_smith_1',
            itemId: 'axe',
            expectedTotal: 25,
            requestId: expect.any(String),
        })
        wrapper.unmount()
    })
    it('claims the exact order and confirms cancellation without refund', async () => {
        const ready = {
            ...workshop,
            orders: [
                {
                    id: 'order-1',
                    npcId: 'npc_smith_1',
                    itemId: 'axe' as const,
                    label: 'Топор',
                    status: 'ready' as const,
                    fullPrice: 25,
                    deposit: 13,
                    remaining: 12,
                    createdAt: 0,
                },
            ],
        }
        const wrapper = openWorkshop(ready, 12)
        await wrapper
            .findAll('button')
            .find((b) => b.text().includes('Получить'))!
            .trigger('click')
        expect(wrapper.emitted('command')?.[0]?.[0]).toMatchObject({
            type: 'craft_order_claim',
            orderId: 'order-1',
            expectedRemaining: 12,
        })
        await wrapper
            .findAll('button')
            .find((b) => b.text() === 'Отменить заказ')!
            .trigger('click')
        expect(wrapper.emitted('command')).toHaveLength(1)
        await wrapper
            .findAll('button')
            .find((b) => b.text() === 'Отменить без возврата аванса')!
            .trigger('click')
        expect(wrapper.emitted('command')?.[1]?.[0]).toMatchObject({
            type: 'craft_order_cancel',
            orderId: 'order-1',
        })
        wrapper.unmount()
    })
})
