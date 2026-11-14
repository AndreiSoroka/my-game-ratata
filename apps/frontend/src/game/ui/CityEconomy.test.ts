import { type MarketSnapshot, quoteMarketTrade } from '@my-game-ratata/contracts'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import CityDemandReport from './CityDemandReport.vue'
import CityMarket from './CityMarket.vue'
import RepairWorkshop from './RepairWorkshop.vue'
const market: MarketSnapshot = {
    cityId: 'city',
    cityName: 'Новогород',
    revision: 1,
    rows: [
        {
            itemId: 'wood',
            label: 'Древесина',
            stock: 1,
            target: 12,
            capacity: 24,
            basePrice: 4,
            consumptionPer10Minutes: 2,
            buyPrice: 9,
            sellPrice: 6,
            deliveredLast10Minutes: 0,
            consumedLast10Minutes: 2,
        },
    ],
}
describe('city economy panels', () => {
    it('quotes the whole batch and sends price, quantity and a new receipt per action', async () => {
        const wrapper = mount(CityMarket, { props: { market, npcId: 'merchant', gold: 50 } })
        await wrapper.get('input').setValue(2)
        expect(wrapper.findAll('.market-row button')[0]?.attributes('disabled')).toBeDefined()
        await wrapper.findAll('.market-controls button')[1]!.trigger('click')
        await wrapper.get('.market-row button').trigger('click')
        await wrapper.get('.market-row button').trigger('click')
        const first = wrapper.emitted('command')![0]![0] as Record<string, unknown>
        const second = wrapper.emitted('command')![1]![0] as Record<string, unknown>
        expect(first).toMatchObject({
            type: 'market_trade',
            side: 'sell',
            quantity: 2,
            npcId: 'merchant',
            expectedTotal: quoteMarketTrade(market.rows[0]!, 'sell', 2),
        })
        expect(first.requestId).not.toBe(second.requestId)
        wrapper.unmount()
    })
    it('repair all includes exactly the quoted instances and cost', async () => {
        const wrapper = mount(RepairWorkshop, {
            props: {
                gold: 10,
                repairs: {
                    npcId: 'smith',
                    total: 10,
                    items: [
                        {
                            instanceId: 'broken',
                            itemId: 'simple_sword',
                            label: 'Меч',
                            durability: 0,
                            maxDurability: 200,
                            price: 10,
                            equipped: true,
                        },
                    ],
                },
            },
        })
        await wrapper.findAll('button')[1]!.trigger('click')
        expect(wrapper.emitted('command')![0]![0]).toMatchObject({
            type: 'repair_items',
            instanceIds: ['broken'],
            expectedTotal: 10,
            npcId: 'smith',
        })
        wrapper.unmount()
    })
    it('shows shortage and separately names city buy and sell prices', () => {
        const wrapper = mount(CityDemandReport, { props: { market } })
        expect(wrapper.text()).toContain('Дефицит')
        expect(wrapper.text()).toContain('6 / 9')
        wrapper.unmount()
    })
})
