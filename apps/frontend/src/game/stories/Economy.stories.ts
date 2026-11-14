import '../ui/adventurePanel.css'

import { type MarketRow, type MarketSnapshot, quoteMarketTrade } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import CityDemandReport from '../ui/CityDemandReport.vue'
import CityMarket from '../ui/CityMarket.vue'
import ItemCondition from '../ui/ItemCondition.vue'
import RepairWorkshop from '../ui/RepairWorkshop.vue'
import { renderVueStory } from './renderVueStory'
const meta = { title: 'Interface/City economy' } satisfies Meta
export default meta
type Story = StoryObj
const market: MarketSnapshot = {
    cityId: 'novogorod',
    cityName: 'Новогород',
    revision: 1,
    rows: [
        {
            itemId: 'wood',
            label: 'Древесина',
            stock: 2,
            target: 12,
            capacity: 24,
            basePrice: 4,
            consumptionPer10Minutes: 2,
            buyPrice: 9,
            sellPrice: 6,
            deliveredLast10Minutes: 1,
            consumedLast10Minutes: 2,
        },
        {
            itemId: 'food',
            label: 'Еда',
            stock: 24,
            target: 24,
            capacity: 48,
            basePrice: 4,
            consumptionPer10Minutes: 4,
            buyPrice: 2,
            sellPrice: 1,
            deliveredLast10Minutes: 6,
            consumedLast10Minutes: 4,
        },
    ],
}
export const Market: Story = {
    render: () => renderVueStory(CityMarket, { market, npcId: 'npc_merchant_1', gold: 40 }),
}
export const Demand: Story = { render: () => renderVueStory(CityDemandReport, { market }) }
function heatingMarket(stock: number): MarketSnapshot {
    const row: MarketRow = {
        itemId: 'brushwood',
        label: 'Хворост',
        stock,
        target: 12,
        capacity: 24,
        basePrice: 1,
        consumptionPer10Minutes: 1,
        deliveredLast10Minutes: 3,
        consumedLast10Minutes: 1,
        buyPrice: null,
        sellPrice: null,
    }
    row.buyPrice = quoteMarketTrade(row, 'buy', 1)
    row.sellPrice = quoteMarketTrade(row, 'sell', 1)
    return { ...market, rows: [row] }
}
export const HeatingSupply: Story = {
    render: () => renderVueStory(CityDemandReport, { market: heatingMarket(6) }),
}
export const HeatingShortage: Story = {
    render: () =>
        renderVueStory(CityMarket, { market: heatingMarket(0), npcId: 'npc_merchant_1', gold: 40 }),
}
export const Repair: Story = {
    render: () =>
        renderVueStory(RepairWorkshop, {
            gold: 20,
            repairs: {
                npcId: 'npc_smith_1',
                total: 12,
                items: [
                    {
                        instanceId: 'sword',
                        itemId: 'simple_sword',
                        label: 'Простой меч',
                        durability: 0,
                        maxDurability: 200,
                        price: 10,
                        equipped: true,
                    },
                    {
                        instanceId: 'axe',
                        itemId: 'axe',
                        label: 'Топор',
                        durability: 850,
                        maxDurability: 1000,
                        price: 2,
                        equipped: false,
                    },
                ],
            },
        }),
}
export const BrokenCondition: Story = {
    render: () =>
        renderVueStory(ItemCondition, {
            item: { instanceId: 'sword', itemId: 'simple_sword', durability: 0 },
        }),
}
