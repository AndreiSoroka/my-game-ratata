import type { WorkshopSnapshot } from '@my-game-ratata/contracts'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import WorkshopOrders from './WorkshopOrders.vue'
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
describe('workshop order payment', () => {
    it('discloses nonrefundable split before placing the order', async () => {
        const wrapper = mount(WorkshopOrders, { props: { workshop, gold: 20 } })
        await wrapper.get('button').trigger('click')
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
        const wrapper = mount(WorkshopOrders, { props: { workshop: ready, gold: 12 } })
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
