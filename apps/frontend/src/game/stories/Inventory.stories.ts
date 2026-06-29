import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderEquipmentStory } from '../ui/renderEquipmentStory'
import { type ChestState, renderChestStory, renderInventoryStory } from '../ui/renderInventoryStory'

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

export const Equipment: Story = {
    render: () => renderEquipmentStory(),
}

export const Chest: Story = {
    args: {
        state: 'closed',
    },
    render: (args) => renderChestStory(args.state),
}
