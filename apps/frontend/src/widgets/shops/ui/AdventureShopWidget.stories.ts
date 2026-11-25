import type {
    AdventureShopOffer,
    AdventureTradeItemId,
    MarketSnapshot,
} from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { fn } from 'storybook/test'
import { h } from 'vue'

import { DialogueTargetSwitcher } from '@/entities/dialogues'
import type { MarketTradeSelection } from '@/entities/shops'
import { renderVueStory } from '@/shared/lib/storybook'

import AdventureShopWidget from './AdventureShopWidget.vue'

interface StoryArgs {
    title: string
    offers: readonly AdventureShopOffer[]
    gold: number
    blockedReason?: string
    market?: MarketSnapshot
    navigation: 'none' | 'empty' | 'text' | 'neighbor'
    onBuy: (itemId: AdventureTradeItemId) => void
    onTrade: (selection: MarketTradeSelection) => void
    onClose: () => void
}

const meta = {
    title: 'Widgets/shops/AdventureShopWidget',
    args: {
        title: 'Товары · Савва',
        offers: [
            { itemId: 'food', label: 'Яблоко', price: 4 },
            { itemId: 'boots', label: 'Сапоги', price: 18 },
        ],
        gold: 12,
        blockedReason: '',
        navigation: 'none',
        onBuy: fn().mockName('buy'),
        onTrade: fn().mockName('trade'),
        onClose: fn().mockName('close'),
    },
    argTypes: {
        title: { control: 'text' },
        offers: { control: 'object' },
        gold: { control: { type: 'number', min: 0, step: 1 } },
        blockedReason: { control: 'text' },
        market: { control: 'object' },
        navigation: {
            control: {
                type: 'select',
                labels: {
                    none: 'Нет',
                    empty: 'Пустой div с фоном',
                    text: 'Текст',
                    neighbor: 'Сосед',
                },
            },
            options: ['none', 'empty', 'text', 'neighbor'],
        },
        onBuy: { control: false },
        onTrade: { control: false },
        onClose: { control: false },
    },
    render({ navigation, ...args }) {
        const slots = {
            none: undefined,
            empty: () => h('div', { style: { minHeight: '20px', background: '#374c82' } }),
            text: () => 'Лада ждёт у входа.',
            neighbor: () =>
                h(DialogueTargetSwitcher, {
                    neighbors: { right: { key: 'character:ally', name: 'Лада' } },
                    onSwitchTarget: fn().mockName('switchTarget'),
                }),
        }
        const host = renderVueStory(
            () => h(AdventureShopWidget, args, { navigation: slots[navigation] }),
            {},
            { padding: '16px' }
        )
        host.style.minHeight = '0'
        host.style.maxWidth = '580px'
        return host
    },
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}

export const Blocked: Story = { args: { blockedReason: 'Вы в чёрном списке Новогорода.' } }

export const Market: Story = {
    args: {
        market: {
            cityId: 'novogorod',
            cityName: 'Новогород',
            revision: 1,
            rows: [
                {
                    itemId: 'grain',
                    label: 'Зерно',
                    stock: 8,
                    target: 12,
                    capacity: 24,
                    basePrice: 3,
                    consumptionPer10Minutes: 2,
                    buyPrice: 5,
                    sellPrice: 4,
                    deliveredLast10Minutes: 3,
                    consumedLast10Minutes: 2,
                },
            ],
        },
    },
}
