import type { DeityMood } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'
import { lightUiColors } from '@/shared/ui/theme'

import PatronMood from './PatronMood.vue'

type StoryArgs = { mood: DeityMood }

const meta = {
    title: 'Entities/player-effects/PatronMood',
    args: { mood: 'neutral' },
    argTypes: {
        mood: { control: 'inline-radio', options: ['benevolent', 'neutral', 'wrathful'] },
    },
    render(args) {
        const host = renderVueStory(PatronMood, args, { background: lightUiColors.panel.parchment })
        host.style.fontFamily = 'var(--ratata-font-family, sans-serif)'
        return host
    },
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}

export const Benevolent: Story = { args: { mood: 'benevolent' } }

export const Neutral: Story = { args: { mood: 'neutral' } }

export const Wrathful: Story = { args: { mood: 'wrathful' } }
