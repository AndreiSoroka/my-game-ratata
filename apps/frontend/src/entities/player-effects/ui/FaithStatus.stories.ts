import type { DeityMood } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'
import { lightUiColors } from '@/shared/ui/theme'

import FaithStatus from './FaithStatus.vue'

interface StoryArgs {
    patronName?: string
    patronMasteryLevel?: number
    patronMood?: DeityMood
    moodChangeId?: number
    prayerChances?: {
        healing: number
        purificationPerStep: number
        resurrection: number | null
    }
    changesInMs?: number
}

const meta = {
    title: 'Entities/player-effects/FaithStatus',
    args: {
        patronName: 'Угольная Мать',
        patronMasteryLevel: 3,
        moodChangeId: 0,
    },
    argTypes: {
        patronName: { control: 'text' },
        patronMasteryLevel: { control: { type: 'number', min: 0, step: 1 } },
        patronMood: {
            control: 'select',
            options: ['unknown', 'benevolent', 'neutral', 'wrathful'],
            mapping: { unknown: undefined },
        },
        moodChangeId: {
            control: { type: 'number', min: 0, step: 1 },
            description: 'Увеличьте число, чтобы повторить подсветку имени.',
        },
        prayerChances: {
            control: 'object',
            description:
                'Доли от 0 до 1. Используйте null для resurrection, пока воскрешение недоступно.',
        },
        changesInMs: {
            control: { type: 'number', min: 0, step: 100 },
            description: 'Остаток времени до смены настроения в миллисекундах.',
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

export const MoodChanged: Story = { args: { moodChangeId: 1 } }

export const KnownMood: Story = { args: { patronMood: 'benevolent' } }

export const PrayerChances: Story = {
    args: {
        patronMood: 'neutral',
        prayerChances: { healing: 0.55, purificationPerStep: 0.2, resurrection: 0.55 },
    },
}

export const CelestialRhythm: Story = {
    args: { ...PrayerChances.args, changesInMs: 11_500 },
}
