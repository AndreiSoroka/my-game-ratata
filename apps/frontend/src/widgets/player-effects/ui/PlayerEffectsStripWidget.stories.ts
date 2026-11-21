import type { Meta, StoryObj } from '@storybook/web-components-vite'

import type { PlayerEffectsSnapshot } from '@/entities/player-effects'
import { renderVueStory } from '@/shared/lib/storybook'

import PlayerEffectsStripWidget from './PlayerEffectsStripWidget.vue'

type Props = InstanceType<typeof PlayerEffectsStripWidget>['$props']

const serverTime = 10_000
const idleCharacter = { alive: true, cooldowns: { stunMsLeft: 0 } } satisfies PlayerEffectsSnapshot
const defaultCharacter = {
    ...idleCharacter,
    abilities: { barrier: { expiresAt: 16_000 } },
    combat: { defensiveStance: false, combo: { stacks: 2, limit: 3, expiresAt: 14_000 } },
    movement: { mode: 'sneaking', dashing: false },
    prayerAuraEffects: ['prayer-blessing'],
    theft: { cooldownMsLeft: 0, wantedMsLeft: 21_500, blacklisted: false },
} satisfies PlayerEffectsSnapshot

const meta = {
    title: 'Widgets/Player effects/PlayerEffectsStripWidget',
    args: { character: defaultCharacter, serverTime },
    argTypes: {
        character: { control: 'object' },
        serverTime: { control: 'number' },
    },
    render(args) {
        const host = renderVueStory(PlayerEffectsStripWidget, { ...args })
        host.style.maxWidth = '272px'
        return host
    },
} satisfies Meta<Props>

export default meta
type Story = StoryObj<Props>

export const Default: Story = {}

export const AllStatuses: Story = {
    args: {
        character: {
            ...defaultCharacter,
            cooldowns: { stunMsLeft: 900 },
            combat: { ...defaultCharacter.combat, defensiveStance: true },
            movement: { ...defaultCharacter.movement, dashing: true },
            prayerAuraEffects: [
                'weakened',
                'slowed',
                'feared',
                'prayer-protection',
                'prayer-blessing',
                'prayer-vulnerability',
            ],
            theft: { cooldownMsLeft: 3_500, wantedMsLeft: 21_500, blacklisted: true },
        },
    },
}

export const Empty: Story = { args: { character: idleCharacter } }
