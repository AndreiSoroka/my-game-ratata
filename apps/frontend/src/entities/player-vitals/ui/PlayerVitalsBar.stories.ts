import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'
import { lightUiColors } from '@/shared/ui/theme'

import PlayerVitalsBar from './PlayerVitalsBar.vue'

type StoryArgs = Pick<
    InstanceType<typeof PlayerVitalsBar>['$props'],
    'value' | 'label' | 'color' | 'trackColor' | 'height' | 'valueText' | 'animated' | 'dimmed'
>

const meta = {
    title: 'Entities/Player vitals/Resource bar',
    args: {
        value: 72,
        label: 'Здоровье',
        color: lightUiColors.bar.health.color,
        trackColor: lightUiColors.bar.health.trackColor,
        height: 18,
        valueText: '36/50',
        animated: false,
        dimmed: false,
    },
    argTypes: {
        value: { control: { type: 'range', min: 0, max: 100 } },
        height: { control: { type: 'number', min: 8 } },
        animated: { control: 'boolean' },
        dimmed: { control: 'boolean' },
    },
    render(args) {
        const host = renderVueStory(PlayerVitalsBar, args, {
            background: lightUiColors.panel.parchment,
        })
        host.style.maxWidth = '300px'
        return host
    },
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

export const Normal: Story = {}

export const Compact: Story = { args: { height: 13 } }

export const Animated: Story = { args: { value: 16, valueText: '8/50', animated: true } }

export const Dimmed: Story = {
    args: { color: lightUiColors.bar.mana.color, label: 'Мана', dimmed: true },
}
