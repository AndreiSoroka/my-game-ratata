import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h } from 'vue'

import { renderVueStory, type StorySlot, storySlot, storySlotControl } from '@/shared/lib/storybook'
import { UiButton } from '@/shared/ui/common'

import ChestPane from './ChestPane.vue'

type Args = InstanceType<typeof ChestPane>['$props'] & { footer: StorySlot; disabledItemId: string }
const meta = {
    title: 'Entities/items/ChestPane',
    args: {
        side: 'chest',
        title: 'Полевые припасы',
        items: [
            { instanceId: 'herbs', itemId: 'herbs', quantity: 4 },
            { instanceId: 'pickaxe', itemId: 'pickaxe', durability: 28 },
        ],
        capacity: 25,
        disabled: false,
        actionLabel: 'Забрать',
        emptyText: 'Контейнер пуст.',
        footer: 'none',
        disabledItemId: '',
    },
    argTypes: {
        side: { control: 'radio', options: ['bag', 'chest'] },
        title: { control: 'text' },
        items: { control: 'object' },
        capacity: { control: 'number' },
        disabled: { control: 'boolean' },
        isItemDisabled: { control: false },
        disabledItemId: { control: 'text' },
        actionLabel: { control: 'text' },
        emptyText: { control: 'text' },
        footer: storySlotControl('Слот под списком'),
    },
} satisfies Meta<Args>
export default meta
type Story = StoryObj<Args>

export const Default: Story = {
    render({ footer, disabledItemId, ...props }) {
        const defaultSlot = storySlot(footer, 'Предметы можно забрать по одному.', () =>
            h(UiButton, { size: 'small' }, { default: () => 'Забрать всё' })
        )
        const isItemDisabled: Args['isItemDisabled'] = (item) => item.instanceId === disabledItemId
        const host = renderVueStory(
            {
                render: () =>
                    h(
                        ChestPane,
                        { ...props, isItemDisabled },
                        defaultSlot ? { default: defaultSlot } : {}
                    ),
            },
            {}
        )
        host.style.maxInlineSize = '350px'
        return host
    },
}
export const Empty: Story = { ...Default, args: { items: [] } }
export const Disabled: Story = { ...Default, args: { disabled: true } }
