import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import InventoryItemDetails from './InventoryItemDetails.vue'

type Args = InstanceType<typeof InventoryItemDetails>['$props']

const meta = {
    title: 'Entities/items/InventoryItemDetails',
    args: { item: { instanceId: 'herbs', itemId: 'herbs', quantity: 7 }, hasNearbyChest: true },
    argTypes: {
        item: { control: 'object' },
        hasNearbyChest: { control: 'boolean' },
    },
} satisfies Meta<Args>
export default meta
type Story = StoryObj<Args>

export const Default: Story = {
    render: (args) => renderVueStory(InventoryItemDetails, args),
}

export const Consumable: Story = {
    ...Default,
    args: { item: { instanceId: 'apple-stack', itemId: 'food', quantity: 2 } },
}
export const Plantable: Story = {
    ...Default,
    args: { item: { instanceId: 'sapling', itemId: 'sapling' } },
}
export const Equipment: Story = {
    ...Default,
    args: { item: { instanceId: 'axe', itemId: 'axe', durability: 9 } },
}
