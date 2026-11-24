import type { ItemInstanceSnapshot } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import ItemCondition from './ItemCondition.vue'

interface StoryArgs {
    item: ItemInstanceSnapshot
}

const meta = {
    title: 'Entities/items/ItemCondition',
    args: { item: { instanceId: 'sword', itemId: 'simple_sword', durability: 97 } },
    argTypes: { item: { control: 'object' } },
    render(args) {
        const host = renderVueStory(
            ItemCondition,
            { ...args },
            { background: 'var(--ui-dark-panel-surface)' }
        )
        host.style.minHeight = '0'
        host.style.maxWidth = '280px'
        return host
    },
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}
export const Broken: Story = { args: { item: { ...meta.args.item, durability: 0 } } }
