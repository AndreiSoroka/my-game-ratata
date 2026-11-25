import type { MarketSnapshot } from '@my-game-ratata/contracts'
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
    it('shows who pays the tax and emits the quoted totals after tax', async () => {
        const wrapper = mount(CityMarket, {
            props: { market, gold: 9, inventory: { wood: { owned: 3, sellable: 2 } } },
        })
        const button = wrapper.get('.market-row button')
        expect(wrapper.text()).toContain('Городской налог 20% округляется вверх. Платит торговец.')
        expect(button.text()).toBe('Купить · 9 ◈')
        const tax = wrapper.get('.market-row__tax--included')
        expect(tax.text()).toBe('Из них 2 ◈ — налог')
        expect(button.attributes('aria-describedby')).toBe(tax.attributes('id'))
        await button.trigger('click')
        await wrapper.get('input').setValue(2)
        expect(button.attributes('disabled')).toBeDefined()
        expect(wrapper.find('.market-row__tax--included').exists()).toBe(false)
        await wrapper
            .get('[role="tab"][aria-selected="true"]')
            .trigger('keydown', { code: 'KeyD', key: 'в' })
        expect(wrapper.text()).toContain(
            'Городской налог 20% округляется вверх и удерживается из выручки.'
        )
        expect(button.text()).toContain('Продать 2 · 10 ◈')
        expect(button.get('.market-row__tax').text()).toBe('Налог · 3 ◈')
        await button.trigger('click')
        await wrapper.setProps({
            market: { ...market, rows: [{ ...market.rows[0]!, stock: 2 }] },
            gold: 18,
        })
        await wrapper.get('[role="tab"][aria-selected="false"]').trigger('click')
        expect(button.text()).toBe('Купить · 18 ◈')
        await button.trigger('click')
        expect(wrapper.emitted('trade')).toEqual([
            [{ side: 'buy', itemId: 'wood', quantity: 1, expectedTotal: 9 }],
            [
                {
                    side: 'sell',
                    itemId: 'wood',
                    quantity: 2,
                    expectedTotal: 10,
                },
            ],
            [{ side: 'buy', itemId: 'wood', quantity: 2, expectedTotal: 18 }],
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
                    buyPrice: 3,
                    sellPrice: 1,
                    deliveredLast10Minutes: 3,
                    consumedLast10Minutes: 1,
                },
            ],
        }
        const wrapper = mount(CityDemandReport, { props: { market: heating } })
        const cells = wrapper.findAll('tbody tr td').map((cell) => cell.text())
        expect(wrapper.text()).toContain('Хворост')
        expect(cells).toEqual(['6 / 12 / 24', '1', '1 / 3 ◈', '3 / 1'])
        wrapper.unmount()
    })
})

it('keeps the sell-only tab selected and uses only sellable items for availability', async () => {
    const wrapper = mount(CityMarket, {
        props: {
            market,
            gold: 0,
            sides: ['sell'],
            inventory: { wood: { owned: 3, sellable: 1 } },
        },
    })
    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs).toHaveLength(1)
    expect(tabs[0]?.text()).toBe('Продать')
    await tabs[0]?.trigger('keydown', { code: 'Home' })
    expect(tabs[0]?.attributes('aria-selected')).toBe('true')
    const button = wrapper.get('.market-row button')
    expect(button.attributes('disabled')).toBeUndefined()
    expect(wrapper.text()).toContain('В сумке 3')
    expect(wrapper.text()).toContain('Можно продать: 1')
    const quantity = wrapper.get('input')
    await quantity.setValue('')
    expect(button.text()).toBe('Укажите количество')
    expect(button.attributes('disabled')).toBeDefined()
    await quantity.setValue(2)
    expect(button.attributes('disabled')).toBeDefined()
    expect(wrapper.get('.market-row__empty-stock').text()).toBe('Можно продать: 1')
    await wrapper.setProps({ inventory: { wood: { owned: 3, sellable: 2 } } })
    expect(button.attributes('disabled')).toBeUndefined()
    await wrapper.setProps({ inventory: {} })
    expect(button.attributes('disabled')).toBeDefined()
    wrapper.unmount()
})
