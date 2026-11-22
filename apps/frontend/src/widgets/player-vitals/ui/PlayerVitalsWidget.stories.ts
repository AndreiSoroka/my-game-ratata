import type { Meta, StoryObj } from '@storybook/web-components-vite'

import type { PlayerVitalsData } from '@/entities/player-vitals'
import { renderVueStory } from '@/shared/lib/storybook'

import PlayerVitalsWidget from './PlayerVitalsWidget.vue'

const percentage = { control: { type: 'range', min: 0, max: 100, step: 1 } } as const

const meta = {
    title: 'Widgets/Player vitals/PlayerVitalsWidget',
    args: {
        nickname: 'Андрей Сорока',
        hpPercent: 100,
        hpSegments: [],
        manaPercent: 100,
        energyPercent: 100,
        energySegments: [],
    },
    argTypes: {
        hpPercent: percentage,
        hpSegments: { control: 'object' },
        manaPercent: percentage,
        energyPercent: percentage,
        energySegments: { control: 'object' },
    },
    render(args) {
        const host = renderVueStory(
            PlayerVitalsWidget,
            { ...args, compact: true },
            { padding: '16px' }
        )
        host.style.maxWidth = '252px'
        return host
    },
} satisfies Meta<PlayerVitalsData>

export default meta
type Story = StoryObj<PlayerVitalsData>

export const Normal: Story = {}

export const Segmented: Story = {
    args: {
        hpPercent: 60,
        hpSegments: [40, 20, 20, 20],
        manaPercent: 45,
        energyPercent: 70,
        energySegments: [30, 20, 10, 10, 10, 10, 10],
    },
}

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
