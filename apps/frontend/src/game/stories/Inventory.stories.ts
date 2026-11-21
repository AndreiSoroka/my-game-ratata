import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { characterFixture } from '../testing/characterFixture'
import InventoryOverlay from '../ui/InventoryOverlay.vue'
import ChestSpritePreview from './ChestSpritePreview.vue'
import ItemCatalogPreview from './ItemCatalog.vue'
import { renderVueStory } from './renderVueStory'

const meta = { title: 'Shared/InventoryOverlay' } satisfies Meta

export default meta
type Story = StoryObj

function inventoryStory(equipped = false): HTMLElement {
    const host = renderVueStory(InventoryOverlay, {
        character: characterFixture('self', {
            inventory: [
                { instanceId: 'apple', itemId: 'food', quantity: 5 },
                { instanceId: 'grain', itemId: 'grain', quantity: 3 },
                { instanceId: 'herbs', itemId: 'herbs', quantity: 9 },
                { instanceId: 'sword', itemId: 'simple_sword', durability: 160 },
            ],
            equipment: equipped
                ? { weapon: { instanceId: 'axe', itemId: 'axe', durability: 700 } }
                : {},
        }),
        chests: [],
        gold: 12,
    })
    host.style.cssText = 'position:relative;min-height:100dvh;background:#354137'
    return host
}

export const UserInventory: Story = {
    render: () => inventoryStory(),
}

export const ItemCatalog: Story = {
    render: () => renderVueStory(ItemCatalogPreview, {}),
}

export const Equipment: Story = {
    render: () => inventoryStory(true),
}

export const Chest: Story = {
    args: {
        state: 'closed',
    },
    argTypes: { state: { control: 'radio', options: ['closed', 'open'] } },
    render: (args) => renderVueStory(ChestSpritePreview, { state: args['state'] }),
}
