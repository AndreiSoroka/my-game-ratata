import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import type { PlayerEffect } from '../model/playerEffects'
import PlayerEffectsStrip from './PlayerEffectsStrip.vue'

type StoryArgs = { effects: readonly PlayerEffect[] }

const meta = {
    title: 'Entities/player-effects/PlayerEffectsStrip',
    args: {
        effects: [
            { kind: 'stun', remainingMs: 800 },
            { kind: 'barrier', remainingMs: 4500 },
            { kind: 'blade-combo', stacks: 2, stackLimit: 3, remainingMs: 1750 },
            { kind: 'prayer-blessing' },
            { kind: 'wanted', remainingMs: 21_500 },
        ],
    },
    argTypes: { effects: { control: 'object' } },
    render(args) {
        const host = renderVueStory(PlayerEffectsStrip, args)
        host.style.maxWidth = '272px'
        return host
    },
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}

export const LawStatuses: Story = {
    args: {
        effects: [
            { kind: 'theft-cooldown', remainingMs: 3500 },
            { kind: 'wanted', remainingMs: 21_500 },
            { kind: 'blacklisted' },
        ],
    },
}

export const RoadPrayer: Story = {
    args: {
        effects: [
            { kind: 'road-prayer-recovery' },
            { kind: 'road-prayer-dash', remainingMs: 8000 },
        ],
    },
}

export const AshExhaustion: Story = {
    args: { effects: [{ kind: 'ash-exhaustion', rank: 2, remainingMs: 1_800_000 }] },
}

export const Empty: Story = { args: { effects: [] } }
