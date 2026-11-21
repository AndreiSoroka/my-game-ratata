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
    title: 'Entities/Player effects/Faith status',
    args: {
        patronName: 'Угольная Мать',
        patronMasteryLevel: 3,
    },
    argTypes: {
        patronMood: {
            control: 'select',
            options: ['benevolent', 'neutral', 'wrathful'] satisfies DeityMood[],
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

export const KnownMood: Story = { args: { patronMood: 'benevolent' } }

export const UnknownMood: Story = {}
