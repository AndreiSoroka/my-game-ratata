import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import PlayerVitalsView from './PlayerVitalsView.vue'
import type { PlayerVitalsViewProps } from './playerVitalsViewProps'

const percentage = { control: { type: 'range', min: 0, max: 100, step: 1 } } as const
const number = { control: { type: 'number', min: 0 } } as const

const meta = {
    title: 'Entities/player-vitals/PlayerVitalsView',
    args: {
        compact: true,
        nickname: 'Андрей Сорока',
        hpPercent: 60,
        hpSegments: [],
        hpAnimated: false,
        manaPercent: 25,
        manaAnimated: false,
        energyPercent: 82,
        energySegments: [],
        energyAnimated: false,
        dimSecondaryResources: false,
    },
    argTypes: {
        compact: { control: 'boolean' },
        nickname: { control: 'text' },
        hpPercent: percentage,
        hpSegments: { control: 'object' },
        hpAnimated: { control: 'boolean' },
        manaPercent: percentage,
        manaAnimated: { control: 'boolean' },
        energyPercent: percentage,
        energySegments: { control: 'object' },
        energyAnimated: { control: 'boolean' },
        dimSecondaryResources: { control: 'boolean' },
        hpCurrent: number,
        hpMax: number,
        manaCurrent: number,
        manaMax: number,
        energyCurrent: number,
        energyMax: number,
    },
    render(args) {
        const host = renderVueStory(PlayerVitalsView, { ...args }, { padding: '16px' })
        host.style.maxWidth = args.compact ? '252px' : '362px'
        return host
    },
} satisfies Meta<PlayerVitalsViewProps>

export default meta
type Story = StoryObj<PlayerVitalsViewProps>

export const Default: Story = {}

export const Segmented: Story = {
    args: {
        hpSegments: [40, 20, 20, 20],
        energyPercent: 70,
        energySegments: [30, 20, 10, 10, 10, 10, 10],
    },
}

export const AuthorizedNumbers: Story = {
    args: {
        hpCurrent: 18,
        hpMax: 30,
        manaCurrent: 10,
        manaMax: 40,
        energyCurrent: 123,
        energyMax: 150,
    },
}
