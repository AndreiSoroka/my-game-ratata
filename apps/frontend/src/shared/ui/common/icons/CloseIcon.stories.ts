import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import { CloseIcon } from './index'

interface IconArgs {
    size: number
    color: string
}

const meta = {
    title: 'Shared/Common/CloseIcon',
    args: { size: 20, color: '#f4e7cc' },
    argTypes: {
        size: { control: { type: 'number', min: 12, max: 64, step: 1 } },
        color: { control: 'color' },
    },
    render: ({ size, color }) =>
        renderVueStory(CloseIcon, { width: size, height: size, style: { color } }),
} satisfies Meta<IconArgs>

export default meta
type Story = StoryObj<IconArgs>

export const Default: Story = {}
