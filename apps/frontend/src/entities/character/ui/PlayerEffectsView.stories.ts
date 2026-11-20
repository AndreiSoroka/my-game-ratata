import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import type { PlayerEffect } from '../model/playerEffects'
import PlayerEffectsView from './PlayerEffectsView.vue'

type StoryArgs = { effects: readonly PlayerEffect[] }

const meta = {
    title: 'Entities/Character/Player effects',
    render(args) {
        const host = renderVueStory(PlayerEffectsView, { ...args }, { padding: '16px' })
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
            { kind: 'stun', remainingMs: 760 },
            { kind: 'barrier', remainingMs: 4500 },
            { kind: 'defensive-stance' },
            { kind: 'blade-combo', stacks: 2, stackLimit: 3, remainingMs: 1750 },
            { kind: 'weakened', remainingMs: 2250 },
            { kind: 'slowed', remainingMs: 1850 },
            { kind: 'feared', remainingMs: 1300 },
        ],
    },
}

export const Movement: Story = {
    args: { effects: [{ kind: 'sneaking' }, { kind: 'dashing' }] },
}

export const PrayerEffects: Story = {
    args: {
        effects: [
            { kind: 'prayer-protection' },
            { kind: 'prayer-blessing' },
            { kind: 'prayer-vulnerability' },
        ],
    },
}

export const Empty: Story = { args: { effects: [] } }
