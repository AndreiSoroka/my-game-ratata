import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderEquipmentStory } from '../ui/renderEquipmentStory'
import { type ChestState, renderChestStory, renderInventoryStory } from '../ui/renderInventoryStory'
import { renderItemCatalogStory } from '../ui/renderItemCatalogStory'

const meta = {
    argTypes: {
        state: {
            control: 'radio',
            options: ['closed', 'open'],
        },
    },
    title: 'Interface/Inventory',
} satisfies Meta<ChestArgs>

export default meta
type ChestArgs = {
    state: ChestState
}
type Story = StoryObj<ChestArgs>

export const UserInventory: Story = {
    render: () => renderInventoryStory(),
}

export const ItemCatalog: Story = {
    render: () => renderItemCatalogStory(),
}

export const Equipment: Story = {
    render: () => renderEquipmentStory(),
}

export const Chest: Story = {
    args: {
        state: 'closed',
    },
    render: (args) => renderChestStory(args.state),
}
