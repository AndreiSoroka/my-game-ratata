import type { Meta, StoryObj } from '@storybook/web-components-vite'

import type { PlayerEffect } from '@/entities/character'
import { renderVueStory } from '@/shared/lib/storybook'

import PlayerEffectsWidget from './PlayerEffectsWidget.vue'

type StoryArgs = { effects: readonly PlayerEffect[] }

const meta = {
    title: 'Widgets/Player effects',
    render(args) {
        const host = renderVueStory(PlayerEffectsWidget, { ...args }, { padding: '16px' })
        host.style.maxWidth = '362px'
        return host
    },
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

export const Crime: Story = {
    args: {
        effects: [
            { kind: 'theft-cooldown', remainingMs: 3500 },
            { kind: 'wanted', remainingMs: 21_500 },
            { kind: 'blacklisted' },
        ],
    },
}

export const Combat: Story = {
    args: {
        effects: [
            { kind: 'stun', remainingMs: 750 },
            { kind: 'barrier', remainingMs: 4500 },
        ],
    },
}

export const Empty: Story = { args: { effects: [] } }
