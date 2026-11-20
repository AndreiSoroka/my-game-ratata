import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'

import type { PlayerEffectsData } from '../model/playerEffects'
import CharacterHudFrame from './CharacterHudFrame.vue'
import PlayerEffectsView from './PlayerEffectsView.vue'

const meta = {
    title: 'Entities/Character/Player effects',
    args: { soulKind: 'spark', isCanSpeak: true },
    argTypes: {
        soulKind: { control: 'inline-radio', options: ['spark', 'echo'] },
        isCanSpeak: { control: 'boolean' },
    },
    render(args) {
        const host = renderVueStory(PlayerEffectsView, { ...args }, { padding: '16px' })
        host.style.maxWidth = '362px'
        return host
    },
} satisfies Meta<PlayerEffectsData>

export default meta
type Story = StoryObj<PlayerEffectsData>

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

export const Compact: Story = {
    args: {
        compact: true,
        effects: [
            { kind: 'stun', remainingMs: 760 },
            { kind: 'barrier', remainingMs: 4500 },
            { kind: 'defensive-stance' },
            { kind: 'prayer-blessing' },
        ],
    },
    render(args) {
        return renderVueStory(
            {
                render: () =>
                    h(CharacterHudFrame, { compact: true, style: { width: '150px' } }, () =>
                        h(PlayerEffectsView, { ...args })
                    ),
            },
            {},
            { padding: '16px' }
        )
    },
}
