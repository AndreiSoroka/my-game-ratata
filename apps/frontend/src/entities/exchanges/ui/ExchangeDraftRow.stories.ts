import type { ItemInstanceSnapshot } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { fn } from 'storybook/test'
import { h, ref } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'

import ExchangeDraftRow from './ExchangeDraftRow.vue'

interface StoryArgs {
    item?: ItemInstanceSnapshot
    available: number
    selected: number
}

const change = fn()
const meta = {
    title: 'Entities/exchanges/ExchangeDraftRow',
    args: {
        item: { instanceId: 'apple', itemId: 'food', quantity: 5 },
        available: 5,
        selected: 2,
    },
    argTypes: {
        item: { control: 'object' },
        available: { control: { type: 'number', min: 0, step: 1 } },
        selected: { control: { type: 'number', min: 0, step: 1 } },
    },
    render(args) {
        const selected = ref(args.selected)
        const host = renderVueStory(
            () =>
                h(ExchangeDraftRow, {
                    ...args,
                    selected: selected.value,
                    onChange: (quantity) => {
                        change(quantity)
                        selected.value = quantity
                    },
                }),
            {},
            { background: 'var(--ui-dark-panel-surface)', padding: '16px' }
        )
        host.style.maxWidth = '560px'
        host.style.minHeight = '0'
        return host
    },
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}

export const Gold: Story = { args: { item: undefined, available: 12, selected: 7 } }

export const Unavailable: Story = { args: { available: 0, selected: 0 } }
