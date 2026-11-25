import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { fn } from 'storybook/test'
import { h } from 'vue'

import { itemAssetCatalog } from '@/shared/lib/item-assets'
import { renderVueStory, type StorySlot, storySlot, storySlotControl } from '@/shared/lib/storybook'

import ItemSlot from './ItemSlot.vue'
import type { ItemSlotProps } from './itemSlotProps'

interface StoryArgs extends ItemSlotProps {
    content: StorySlot
    onClick: () => void
}

const meta = {
    title: 'Shared/Common/ItemSlot',
    args: {
        as: 'span',
        size: 'default',
        selected: false,
        empty: false,
        disabled: false,
        quantity: 3,
        src: itemAssetCatalog.food.src,
        alt: 'Яблоко',
        content: 'none',
        onClick: fn(),
    },
    argTypes: {
        as: { control: 'inline-radio', options: ['span', 'button'] },
        size: { control: 'inline-radio', options: ['default', 'compact'] },
        selected: { control: 'boolean' },
        empty: { control: 'boolean' },
        disabled: { control: 'boolean' },
        quantity: { control: { type: 'number', min: 1, step: 1 } },
        src: { control: 'text' },
        alt: { control: 'text' },
        content: storySlotControl('Содержимое слота'),
        onClick: { control: false },
    },
    render({ content, ...props }) {
        const label = props.alt || 'Пустой слот'
        const buttonLabel = (props.quantity ?? 1) > 1 ? `${label} × ${props.quantity}` : label
        return renderVueStory(
            () =>
                h(
                    ItemSlot,
                    {
                        ...props,
                        'aria-label': props.as === 'button' ? buttonLabel : undefined,
                    },
                    {
                        default: storySlot(
                            content,
                            '1',
                            () =>
                                h(
                                    'span',
                                    { style: { position: 'absolute', top: '3px', left: '4px' } },
                                    '★'
                                ),
                            { inline: true }
                        ),
                    }
                ),
            {}
        )
    },
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}
export const Compact: Story = { args: { size: 'compact', quantity: 1 } }
export const Selected: Story = { args: { as: 'button', selected: true } }
export const Empty: Story = { args: { as: 'button', empty: true, src: '', alt: '', quantity: 1 } }
