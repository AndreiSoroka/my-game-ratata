import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'
import { lightUiColors } from '@/shared/ui/theme'

import GameBarStory from './GameBarStory.vue'
import type { GameBarProps } from './index'

const meta = {
    title: 'Shared/Common/GameBar',
    args: {
        value: 72,
        max: 100,
        color: lightUiColors.bar.health.color,
        trackColor: lightUiColors.bar.track,
        textColor: lightUiColors.bar.text,
        height: 24,
        label: 'Здоровье',
        showValue: false,
        shadow: true,
    },
    parameters: { backgrounds: { disable: false } },
    argTypes: {
        value: { control: 'number' },
        max: { control: 'number' },
        color: { control: 'text' },
        trackColor: { control: 'text' },
        textColor: { control: 'text' },
        height: { control: { type: 'range', min: 8, max: 48, step: 2 } },
        label: { control: 'text' },
        showValue: { control: 'boolean' },
        shadow: { control: 'boolean' },
    },
} satisfies Meta<GameBarProps>
export default meta
type Story = StoryObj<GameBarProps>

function preview(section: string, props: Partial<GameBarProps> = {}): HTMLElement {
    return renderVueStory(GameBarStory, { section, ...props })
}

export const Default: Story = { render: (args) => preview('default', args) }
export const Resources: Story = {
    parameters: { controls: { disable: true } },
    render: () => preview('resources'),
}
export const Values: Story = {
    parameters: { controls: { disable: true } },
    render: () => preview('values'),
}
export const Colors: Story = {
    parameters: { controls: { disable: true } },
    render: () => preview('colors'),
}
export const Sizes: Story = {
    parameters: { controls: { disable: true } },
    render: () => preview('sizes'),
}
