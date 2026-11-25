import type { Meta, StoryObj } from '@storybook/web-components-vite'

import ChestSpritePreview from './ChestSpritePreview.vue'
import ItemCatalogPreview from './ItemCatalog.vue'
import { renderVueStory } from './renderVueStory'

const meta = { title: 'Game/Item and chest catalog' } satisfies Meta
export default meta
type Story = StoryObj

export const ItemCatalog: Story = {
    render: () => renderVueStory(ItemCatalogPreview, {}),
}

export const Chest: Story = {
    args: {
        state: 'closed',
    },
    argTypes: { state: { control: 'radio', options: ['closed', 'open'] } },
    render: (args) => renderVueStory(ChestSpritePreview, { state: args['state'] }),
}
