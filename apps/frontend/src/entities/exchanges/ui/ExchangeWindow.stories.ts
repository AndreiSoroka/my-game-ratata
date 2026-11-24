import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { fn } from 'storybook/test'
import { h } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'

import { exchangeStoryPrimitives } from './exchangeStoryPrimitives'
import ExchangeWindow from './ExchangeWindow.vue'
import type { ExchangeWindowProps } from './exchangeWindowProps'

const draftItems = {
    none: undefined,
    empty: () => h('li', { role: 'presentation' }, h('div')),
    bag: () => h('li', { style: { padding: '6px' } }, 'Яблоко × 5 · предложено 2'),
}
const draftGold = {
    none: undefined,
    empty: () => h('div'),
    balance: () => [h('span', 'Свободно 12 золотых'), h('strong', '◈ 7')],
}
const actions = {
    onAll: fn(),
    onClear: fn(),
    onEdit: fn(),
    onPropose: fn(),
    onConfirm: fn(),
    onClose: fn(),
    onRestart: fn(),
}

interface StoryArgs extends Omit<ExchangeWindowProps, 'primitives'> {
    draftItems: keyof typeof draftItems
    draftGold: keyof typeof draftGold
}

const meta = {
    title: 'Entities/exchanges/ExchangeWindow',
    args: {
        exchange: {
            partnerName: 'Капля',
            status: 'active',
            own: {
                items: [{ instanceId: 'apple', itemId: 'food', quantity: 2 }],
                gold: 7,
                accepted: false,
            },
            other: {
                items: [{ instanceId: 'grain', itemId: 'grain', quantity: 3 }],
                gold: 0,
                accepted: false,
            },
        },
        draft: {
            editing: true,
            withdrawing: false,
            confirming: false,
            error: '',
            valid: true,
            pending: false,
            dirty: true,
            empty: false,
            canConfirm: false,
        },
        partnerAvailable: true,
        draftItems: 'bag',
        draftGold: 'balance',
    },
    argTypes: {
        exchange: { control: 'object' },
        draft: { control: 'object' },
        partnerAvailable: { control: 'boolean' },
        draftItems: {
            name: 'Слот предметов черновика',
            control: {
                type: 'select',
                labels: { none: 'Без слота', empty: 'Пустой div', bag: 'Рюкзак' },
            },
            options: ['none', 'empty', 'bag'],
        },
        draftGold: {
            name: 'Слот золота черновика',
            control: {
                type: 'select',
                labels: { none: 'Без слота', empty: 'Пустой div', balance: 'Кошелёк' },
            },
            options: ['none', 'empty', 'balance'],
        },
    },
    render({ draftItems: items, draftGold: gold, ...props }) {
        const slots = { draftItems: draftItems[items], draftGold: draftGold[gold] }
        const host = renderVueStory(
            () =>
                h(
                    ExchangeWindow,
                    { ...props, ...actions, primitives: exchangeStoryPrimitives },
                    slots
                ),
            {},
            { background: 'var(--ui-dark-panel-surface)', padding: '16px' }
        )
        host.style.color = 'var(--ui-dark-panel-text)'
        host.style.display = 'flex'
        host.style.flexDirection = 'column'
        host.style.height = 'min(520px, 100dvh)'
        host.style.minHeight = '0'
        host.style.maxWidth = '1024px'
        return host
    },
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}

const acceptedExchange = {
    ...meta.args.exchange,
    own: { ...meta.args.exchange.own, accepted: true },
}
const readOnlyDraft = { ...meta.args.draft, editing: false, dirty: false }

export const Accepted: Story = {
    args: { exchange: acceptedExchange, draft: readOnlyDraft },
}

export const Completed: Story = {
    args: {
        exchange: {
            ...acceptedExchange,
            status: 'completed',
            other: { ...acceptedExchange.other, accepted: true },
        },
        draft: readOnlyDraft,
    },
}
