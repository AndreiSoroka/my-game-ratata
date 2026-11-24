import type { MarketSnapshot } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { fn } from 'storybook/test'

import { renderVueStory } from '@/shared/lib/storybook'

import type { MarketTradeSelection } from '../model/marketTradeSelection'
import CityMarket from './CityMarket.vue'
import { cityMarketExample, heatingMarketExample } from './cityMarketStoryFixtures'

interface StoryArgs {
    market: MarketSnapshot
    gold: number
    blocked: boolean
    onTrade: (selection: MarketTradeSelection) => void
}

const meta = {
    title: 'Entities/shops/CityMarket',
    args: {
        market: {
            cityId: 'novogorod',
            cityName: 'Новогород',
            revision: 1,
            rows: [
                {
                    itemId: 'food',
                    label: 'Яблоко',
                    stock: 12,
                    target: 10,
                    capacity: 20,
                    basePrice: 4,
                    fixedPrice: true,
                    consumptionPer10Minutes: 1,
                    buyPrice: 4,
                    sellPrice: null,
                    deliveredLast10Minutes: 0,
                    consumedLast10Minutes: 1,
                },
            ],
        },
        gold: 12,
        blocked: false,
        onTrade: fn().mockName('trade'),
    },
    argTypes: {
        market: { control: 'object' },
        gold: { control: { type: 'number', min: 0, step: 1 } },
        blocked: { control: 'boolean' },
        onTrade: { control: false },
    },
    render(args) {
        const host = renderVueStory(CityMarket, { ...args })
        host.style.minHeight = '0'
        host.style.maxWidth = '560px'
        return host
    },
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}

export const Blocked: Story = { args: { blocked: true } }

export const CityStock: Story = { args: { market: cityMarketExample, gold: 40 } }

export const HeatingShortage: Story = { args: { market: heatingMarketExample(0), gold: 40 } }
