import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h } from 'vue'

import {
    CharacterHudFrame,
    type PatronStatusEntry,
    type PlayerStatusData,
} from '@/entities/character'
import { renderVueStory } from '@/shared/lib/storybook'

import PlayerStatusWidget from './PlayerStatusWidget.vue'

const percentage = { control: { type: 'range', min: 0, max: 100, step: 1 } } as const
const patron = { id: 'hearth', name: 'Угольная Мать', level: 3 } satisfies PatronStatusEntry

const meta = {
    title: 'Widgets/Player status',
    args: {
        nickname: 'Андрей Сорока',
        hpPercent: 100,
        manaPercent: 100,
        energyPercent: 100,
        patrons: [],
    },
    argTypes: {
        hpPercent: percentage,
        manaPercent: percentage,
        energyPercent: percentage,
        patrons: { control: 'object' },
    },
    render(args) {
        return renderVueStory(
            {
                render: () =>
                    h(
                        CharacterHudFrame,
                        { compact: true, style: { width: 'min(220px, 100%)' } },
                        () => h(PlayerStatusWidget, { ...args, compact: true })
                    ),
            },
            {},
            { padding: '16px' }
        )
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

export const FaithKnown: Story = { args: { patrons: [{ ...patron, mood: 'benevolent' }] } }

export const FaithUnknownMood: Story = { args: { patrons: [patron] } }
