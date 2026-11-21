import type { DeityMood } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'
import { lightUiColors } from '@/shared/ui/theme'

import FaithStatus from './FaithStatus.vue'

interface StoryArgs {
    patronName?: string
    patronMasteryLevel?: number
    patronMood?: DeityMood
}

const meta = {
    title: 'Entities/player-effects/FaithStatus',
    args: {
        patronName: 'Угольная Мать',
        patronMasteryLevel: 3,
    },
    argTypes: {
        patronName: { control: 'text' },
        patronMasteryLevel: { control: { type: 'number', min: 0, step: 1 } },
        patronMood: {
            control: 'select',
            options: ['unknown', 'benevolent', 'neutral', 'wrathful'],
            mapping: { unknown: undefined },
        },
    },
    render(args) {
        const host = renderVueStory(
            FaithStatus,
            { ...args },
            { background: lightUiColors.panel.parchment }
        )
        host.style.maxWidth = '330px'
        return host
    },
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}

export const KnownMood: Story = { args: { patronMood: 'benevolent' } }
