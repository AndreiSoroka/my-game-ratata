import type { Meta, StoryObj } from '@storybook/web-components-vite'

import type { PlayerStatusData } from '@/entities/character'
import { renderVueStory } from '@/shared/lib/storybook'

import PlayerStatusWidget from './PlayerStatusWidget.vue'

const percentage = { control: { type: 'range', min: 0, max: 100, step: 1 } } as const
const patron = { patronName: 'Угольная Мать', patronMasteryLevel: 3 }

const meta = {
    title: 'Widgets/Player status',
    args: {
        nickname: 'Андрей Сорока',
        soulKind: 'spark',
        isCanSpeak: true,
        hpPercent: 100,
        manaPercent: 100,
        energyPercent: 100,
    },
    argTypes: {
        hpPercent: percentage,
        manaPercent: percentage,
        energyPercent: percentage,
    },
    render(args) {
        const host = renderVueStory(PlayerStatusWidget, { ...args }, { padding: '16px' })
        host.style.maxWidth = '332px'
        return host
    },
} satisfies Meta<PlayerStatusData>

export default meta
type Story = StoryObj<PlayerStatusData>

export const Normal: Story = {}

export const LongName: Story = { args: { nickname: 'МихаилСорокаНовгородский' } }

export const EmptyResources: Story = {
    args: { hpPercent: 0, manaPercent: 0, energyPercent: 0 },
}

export const LowResources: Story = {
    args: { hpPercent: 3, manaPercent: 5, energyPercent: 5 },
}

export const LowHealth: Story = { args: { hpPercent: 25 } }

export const AuthorizedNumbers: Story = {
    args: {
        hpPercent: 60,
        hpCurrent: 18,
        hpMax: 30,
        manaPercent: 99,
        manaCurrent: 39.6,
        manaMax: 40,
        energyPercent: 68,
        energyCurrent: 102,
        energyMax: 150,
    },
}

export const ScriptedEcho: Story = { args: { soulKind: 'echo', isCanSpeak: false } }

export const FaithKnown: Story = { args: { ...patron, patronMood: 'benevolent' } }

export const FaithUnknownMood: Story = { args: patron }
