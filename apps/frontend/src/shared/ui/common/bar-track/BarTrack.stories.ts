import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'
import { lightUiColors } from '@/shared/ui/theme'

import BarTrackStory from './BarTrackStory.vue'
import type { BarTrackProps } from './index'

const meta = {
    title: 'Shared/Common/BarTrack',
    args: { color: lightUiColors.bar.track, height: 24, shadow: true },
    parameters: { backgrounds: { disable: false } },
    argTypes: {
        color: { control: 'text' },
        height: { control: { type: 'range', min: 8, max: 48, step: 2 } },
        shadow: { control: 'boolean' },
    },
} satisfies Meta<BarTrackProps>
export default meta
type Story = StoryObj<BarTrackProps>

export const Default: Story = {
    render: (args) => renderVueStory(BarTrackStory, { section: 'default', ...args }),
}
export const Colors: Story = {
    parameters: { controls: { disable: true } },
    render: () => renderVueStory(BarTrackStory, { section: 'colors' }),
}
export const Sizes: Story = {
    parameters: { controls: { disable: true } },
    render: () => renderVueStory(BarTrackStory, { section: 'sizes' }),
}
