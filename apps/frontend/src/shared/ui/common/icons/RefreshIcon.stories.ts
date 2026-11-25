import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import { RefreshIcon } from './index'

interface IconArgs {
    size: number
    color: string
}

const meta = {
    title: 'Shared/Common/RefreshIcon',
    args: { size: 20, color: '#f4e7cc' },
    argTypes: {
        size: { control: { type: 'number', min: 12, max: 64, step: 1 } },
        color: { control: 'color' },
    },
    render: ({ size, color }) =>
        renderVueStory(RefreshIcon, { width: size, height: size, style: { color } }),
} satisfies Meta<IconArgs>

export default meta
type Story = StoryObj<IconArgs>

export const Default: Story = {}
