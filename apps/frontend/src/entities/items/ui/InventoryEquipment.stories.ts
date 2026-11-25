import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import InventoryEquipment from './InventoryEquipment.vue'

type Args = InstanceType<typeof InventoryEquipment>['$props']

const meta = {
    title: 'Entities/items/InventoryEquipment',
    args: {
        character: {
            archetype: 'human',
            equipment: {
                weapon: { instanceId: 'axe', itemId: 'axe', durability: 700 },
                light: { instanceId: 'lantern', itemId: 'lantern' },
            },
        },
    },
    argTypes: {
        character: { control: 'object' },
    },
} satisfies Meta<Args>
export default meta
type Story = StoryObj<Args>

export const Default: Story = {
    render(args) {
        const host = renderVueStory(InventoryEquipment, args)
        host.style.maxInlineSize = '230px'
        return host
    },
}
export const EmptyEquipment: Story = {
    ...Default,
    args: { character: { archetype: 'human', equipment: {} } },
}
