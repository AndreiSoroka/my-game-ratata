import type { ExchangeOfferSnapshot } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h } from 'vue'

import { itemAssetCatalog } from '@/shared/lib/item-assets'
import { renderVueStory } from '@/shared/lib/storybook'
import { darkPanelButtonColors, ItemSlot, UiButton } from '@/shared/ui/common'

import ExchangeOfferPane from './ExchangeOfferPane.vue'

const contentExamples = {
    offer: undefined,
    empty: () => h('div', { style: { minHeight: '30px', background: '#8b4865' } }),
    bag: () => h('div', { style: { padding: '8px 10px' } }, 'В рюкзаке осталось 3 яблока.'),
    example: () => h(ItemSlot, { quantity: 3, alt: 'Яблоки', src: itemAssetCatalog.food.src }),
}

const goldExamples = {
    offer: undefined,
    empty: () => h('div', { style: { height: '16px', background: '#374c82' } }),
    text: () => 'В кошельке есть золото.',
    balance: () => [h('span', 'Золото в кошельке'), h('strong', '◈ 12')],
}
const actionExamples = {
    none: undefined,
    empty: () => h('div', { style: { height: '24px', background: '#625091' } }),
    text: () => 'Предложение можно изменить.',
    edit: () =>
        h(
            UiButton,
            { appearance: 'panel', panel: 'panel-015', colors: darkPanelButtonColors },
            () => 'Изменить предложение'
        ),
}

interface StoryArgs {
    title: string
    offer: ExchangeOfferSnapshot
    terminal: boolean
    showConsent: boolean
    default: keyof typeof contentExamples
    gold: keyof typeof goldExamples
    actions: keyof typeof actionExamples
}

const meta = {
    title: 'Entities/exchanges/ExchangeOfferPane',
    args: {
        title: 'Мира',
        offer: {
            accepted: false,
            items: [
                { instanceId: 'apple', itemId: 'food', quantity: 2 },
                { instanceId: 'sword', itemId: 'simple_sword', durability: 180 },
            ],
            gold: 7,
        },
        terminal: false,
        showConsent: true,
        default: 'offer',
        gold: 'offer',
        actions: 'none',
    },
    argTypes: {
        title: { control: 'text' },
        offer: { control: 'object' },
        terminal: { control: 'boolean' },
        showConsent: { control: 'boolean' },
        default: {
            name: 'Слот предметов',
            control: {
                type: 'select',
                labels: { offer: 'Предметы предложения', empty: 'Пустой div', bag: 'Рюкзак' },
            },
            options: ['offer', 'empty', 'bag', 'example'],
        },
        gold: {
            name: 'Слот золота',
            control: {
                type: 'select',
                labels: { offer: 'Золото предложения', empty: 'Пустой div', balance: 'Кошелёк' },
            },
            options: ['offer', 'empty', 'text', 'balance'],
        },
        actions: {
            name: 'Слот действий',
            control: {
                type: 'select',
                labels: { none: 'Без действий', empty: 'Пустой div', edit: 'Изменить предложение' },
            },
            options: ['none', 'empty', 'text', 'edit'],
        },
    },
    render({ default: content, gold, actions, ...props }) {
        const slots = {
            default: contentExamples[content],
            gold: goldExamples[gold],
            actions: actionExamples[actions],
        }
        const host = renderVueStory(
            () => h(ExchangeOfferPane, props, slots),
            {},
            { background: 'var(--ui-dark-panel-surface)', padding: '16px' }
        )
        host.style.minHeight = '0'
        host.style.maxWidth = '380px'
        host.style.color = 'var(--ui-dark-panel-text)'
        return host
    },
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}

export const Empty: Story = { args: { offer: { accepted: false, items: [], gold: 0 } } }

export const Accepted: Story = { args: { offer: { ...meta.args.offer, accepted: true } } }
