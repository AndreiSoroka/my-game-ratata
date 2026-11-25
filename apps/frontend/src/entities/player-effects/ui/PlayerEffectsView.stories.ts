import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'
import { HudFrame } from '@/shared/ui/common'

import PlayerEffectsView from './PlayerEffectsView.vue'
import type { PlayerEffectsData } from './playerEffectsViewProps'
import SoulBadgeIcons from './SoulBadgeIcons.vue'

type StoryArgs = PlayerEffectsData & { identity: 'none' | 'empty' | 'text' | 'soul-badge' }

const identitySlots = {
    none: undefined,
    empty: ({ class: className }: { class: string }) =>
        h('div', { class: className, style: { minHeight: '16px', background: '#8b4865' } }),
    text: ({ class: className }: { class: string }) => h('span', { class: className }, 'Искра'),
    'soul-badge': ({ class: className }: { class: string }) =>
        h(SoulBadgeIcons, { class: className, soulKind: 'spark', isCanSpeak: true }),
}

function renderEffects({ identity, ...props }: StoryArgs, framed = false): HTMLElement {
    const view = () => h(PlayerEffectsView, props, { identity: identitySlots[identity] })
    const host = renderVueStory(
        { render: framed ? () => h(HudFrame, { style: { width: '150px' } }, view) : view },
        {},
        { padding: '16px' }
    )
    if (!framed) host.style.maxWidth = '362px'
    return host
}

const meta = {
    title: 'Entities/player-effects/PlayerEffectsView',
    args: {
        effects: [{ kind: 'barrier', remainingMs: 4500 }],
        compact: false,
        identity: 'empty',
    },
    argTypes: {
        effects: { control: 'object' },
        compact: { control: 'boolean' },
        identity: { control: 'select', options: Object.keys(identitySlots) },
    },
    render: (args) => renderEffects(args),
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}

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

export const WithIdentity: Story = { args: { identity: 'soul-badge' } }

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
    render: (args) => renderEffects(args, true),
}
