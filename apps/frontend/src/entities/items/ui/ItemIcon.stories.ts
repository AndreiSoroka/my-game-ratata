import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import ItemIcon from './ItemIcon.vue'

type Args = InstanceType<typeof ItemIcon>['$props']

const meta = {
    title: 'Entities/items/ItemIcon',
    args: { item: { itemId: 'herbs', quantity: 4 }, showQuantity: true },
    argTypes: {
        item: { control: 'object' },
        showQuantity: { control: 'boolean' },
    },
} satisfies Meta<Args>
export default meta
type Story = StoryObj<Args>

export const Default: Story = {
    render: (args) => renderVueStory(ItemIcon, args),
}
export const SingleItem: Story = { ...Default, args: { item: { itemId: 'lantern' } } }
