import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import type { PlayerStatusViewProps } from '../model/playerStatus'
import PlayerStatusView from './PlayerStatusView.vue'

const percentage = { control: { type: 'range', min: 0, max: 100, step: 1 } } as const
const number = { control: { type: 'number', min: 0 } } as const

const meta = {
    title: 'Entities/Character/Player status',
    args: {
        nickname: 'Андрей Сорока',
        hpPercent: 60,
        hpAnimated: false,
        manaPercent: 25,
        manaAnimated: false,
        energyPercent: 82,
        energyAnimated: false,
        dimSecondaryResources: false,
        patrons: [],
    },
    argTypes: {
        nickname: { control: 'text' },
        hpPercent: percentage,
        hpAnimated: { control: 'boolean' },
        manaPercent: percentage,
        manaAnimated: { control: 'boolean' },
        energyPercent: percentage,
        energyAnimated: { control: 'boolean' },
        dimSecondaryResources: { control: 'boolean' },
        hpCurrent: number,
        hpMax: number,
        manaCurrent: number,
        manaMax: number,
        energyCurrent: number,
        energyMax: number,
        patrons: { control: 'object' },
    },
    render(args) {
        const host = renderVueStory(PlayerStatusView, { ...args }, { padding: '16px' })
        host.style.maxWidth = '362px'
        return host
    },
} satisfies Meta<PlayerStatusViewProps>

export default meta
type Story = StoryObj<PlayerStatusViewProps>

export const Normal: Story = {}

export const MultiplePatrons: Story = {
    args: {
        patrons: [
            { id: 'road', name: 'Безымянный Путник', level: 2 },
            { id: 'hearth', name: 'Угольная Мать', level: 6, mood: 'benevolent' },
            { id: 'grave', name: 'Хранитель Праха', level: 3, mood: 'wrathful' },
            { id: 'lantern', name: 'Слепой Архивариус', mood: 'neutral' },
        ],
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
