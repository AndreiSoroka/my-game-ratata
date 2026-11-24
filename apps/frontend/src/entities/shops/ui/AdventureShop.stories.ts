import type { AdventureShopOffer, AdventureTradeItemId } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { fn } from 'storybook/test'
import { h } from 'vue'

import { itemAssetCatalog } from '@/shared/lib/item-assets'
import { renderVueStory } from '@/shared/lib/storybook'
import { ItemSlot } from '@/shared/ui/common'

import AdventureShop from './AdventureShop.vue'

const marketExamples = {
    none: undefined,
    empty: () => h('div'),
    example: () =>
        h('div', [
            h('strong', 'Городской рынок'),
            h('p', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
                h(ItemSlot, { src: itemAssetCatalog.food.src, size: 'compact' }),
                'Яблоко · в наличии 12 из 20',
            ]),
        ]),
}

interface StoryArgs {
    offers: readonly AdventureShopOffer[]
    gold: number
    blockedReason?: string
    market: keyof typeof marketExamples
    onBuy: (itemId: AdventureTradeItemId) => void
    onBack: () => void
}

const meta = {
    title: 'Entities/shops/AdventureShop',
    args: {
        offers: [
            { itemId: 'food', label: 'Яблоко', price: 4 },
            { itemId: 'boots', label: 'Сапоги', price: 18 },
        ],
        gold: 12,
        blockedReason: '',
        market: 'none',
        onBuy: fn().mockName('buy'),
        onBack: fn().mockName('back'),
    },
    argTypes: {
        offers: { control: 'object' },
        gold: { control: { type: 'number', min: 0, step: 1 } },
        blockedReason: { control: 'text' },
        market: {
            control: {
                type: 'select',
                labels: { none: 'Без слота', empty: 'Пустой div', example: 'Городской рынок' },
            },
            options: ['none', 'empty', 'example'],
        },
        onBuy: { control: false },
        onBack: { control: false },
    },
    render({ market, ...props }) {
        const renderMarket = marketExamples[market]
        const host = renderVueStory(
            () => h(AdventureShop, props, renderMarket && { market: renderMarket }),
            {},
            { background: 'var(--ui-dark-panel-surface)' }
        )
        host.style.minHeight = '0'
        host.style.maxWidth = '580px'
        host.style.color = 'var(--ui-dark-panel-text)'
        return host
    },
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}

export const Blocked: Story = {
    args: { blockedReason: 'Вы в чёрном списке Новогорода.' },
}

export const Market: Story = { args: { market: 'example' } }
