import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'
import { lightUiColors } from '@/shared/ui/theme'

import BarFillStory from './BarFillStory.vue'
import type { BarFillProps } from './index'

const meta = {
    title: 'Shared/Common/BarFill',
    args: { color: lightUiColors.bar.health.color, height: 24, shadow: true },
    argTypes: {
        color: { control: 'text' },
        height: { control: { type: 'range', min: 8, max: 48, step: 2 } },
        shadow: { control: 'boolean' },
    },
} satisfies Meta<BarFillProps>
export default meta
type Story = StoryObj<BarFillProps>

function preview(section: 'default' | 'colors' | 'sizes', args: BarFillProps = {}): HTMLElement {
    const host = renderVueStory(
        BarFillStory,
        { section, ...args },
        { background: lightUiColors.panel.coffee }
    )
    host.style.minHeight = '100dvh'
    return host
}

export const Default: Story = { render: (args) => preview('default', args) }
export const Colors: Story = {
    parameters: { controls: { disable: true } },
    render: () => preview('colors'),
}
export const Sizes: Story = {
    parameters: { controls: { disable: true } },
    render: () => preview('sizes'),
}
