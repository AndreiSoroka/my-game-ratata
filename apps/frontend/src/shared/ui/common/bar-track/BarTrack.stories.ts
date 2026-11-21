import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'
import { lightUiColors } from '@/shared/ui/theme'

import BarTrackStory from './BarTrackStory.vue'
import { BarTrack, type BarTrackProps } from './index'

const meta = {
    title: 'Shared/Common/BarTrack',
    args: { color: lightUiColors.bar.track, height: 24, shadow: true },
    argTypes: {
        color: { control: 'text' },
        height: { control: { type: 'range', min: 8, max: 48, step: 2 } },
        shadow: { control: 'boolean' },
    },
} satisfies Meta<BarTrackProps>
export default meta
type Story = StoryObj<BarTrackProps>

function preview(section: 'colors' | 'sizes'): HTMLElement {
    const host = renderVueStory(
        BarTrackStory,
        { section },
        { background: lightUiColors.panel.coffee }
    )
    host.style.minHeight = '100dvh'
    return host
}

export const Default: Story = {
    render: (args) =>
        renderVueStory(BarTrack, {
            ...args,
            'data-testid': 'track-default',
            style: { maxWidth: '560px' },
        }),
}
export const Colors: Story = {
    parameters: { controls: { disable: true } },
    render: () => preview('colors'),
}
export const Sizes: Story = {
    parameters: { controls: { disable: true } },
    render: () => preview('sizes'),
}
