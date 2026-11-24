import { type MarketSnapshot, quoteMarketTrade } from '@my-game-ratata/contracts'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { CityDemandReport, CityMarket, RepairWorkshop } from '@/entities/shops'

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
    it('quotes the whole batch and emits the selected market trade', async () => {
        const wrapper = mount(CityMarket, { props: { market, gold: 50 } })
        await wrapper.get('input').setValue(2)
        expect(wrapper.findAll('.market-row button')[0]?.attributes('disabled')).toBeDefined()
        await wrapper.get('[role="tab"][aria-selected="false"]').trigger('click')
        await wrapper.get('.market-row button').trigger('click')
        expect(wrapper.emitted('trade')).toEqual([
            [
                {
                    side: 'sell',
                    itemId: 'wood',
                    quantity: 2,
                    expectedTotal: quoteMarketTrade(market.rows[0]!, 'sell', 2),
                },
            ],
        ])
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
        expect(wrapper.emitted('repair')).toEqual([[['broken'], 10]])
        wrapper.unmount()
    })
    it('shows shortage and separately names city buy and sell prices', () => {
        const wrapper = mount(CityDemandReport, { props: { market } })
        expect(wrapper.text()).toContain('Дефицит')
        expect(wrapper.text()).toContain('6 / 9')
        wrapper.unmount()
    })
    it('reports brushwood heating stock, demand and actual deliveries and consumption', () => {
        const heating: MarketSnapshot = {
            ...market,
            rows: [
                {
                    itemId: 'brushwood',
                    label: 'Хворост',
                    stock: 6,
                    target: 12,
                    capacity: 24,
                    basePrice: 1,
                    consumptionPer10Minutes: 1,
                    buyPrice: 2,
                    sellPrice: 1,
                    deliveredLast10Minutes: 3,
                    consumedLast10Minutes: 1,
                },
            ],
        }
        const wrapper = mount(CityDemandReport, { props: { market: heating } })
        const cells = wrapper.findAll('tbody tr td').map((cell) => cell.text())
        expect(wrapper.text()).toContain('Хворост')
        expect(cells).toEqual(['6 / 12 / 24', '1', '1 / 2 ◈', '3 / 1'])
        wrapper.unmount()
    })
})
