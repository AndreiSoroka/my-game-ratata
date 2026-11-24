import type { MarketSnapshot } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import CityDemandReport from './CityDemandReport.vue'
import { cityMarketExample, heatingMarketExample } from './cityMarketStoryFixtures'

interface StoryArgs {
    market: MarketSnapshot
}

const meta = {
    title: 'Entities/shops/CityDemandReport',
    args: { market: cityMarketExample },
    argTypes: { market: { control: 'object' } },
    render(args) {
        const host = renderVueStory(CityDemandReport, { ...args })
        host.style.minHeight = '0'
        host.style.maxWidth = '640px'
        return host
    },
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}

export const HeatingSupply: Story = { args: { market: heatingMarketExample(6) } }
