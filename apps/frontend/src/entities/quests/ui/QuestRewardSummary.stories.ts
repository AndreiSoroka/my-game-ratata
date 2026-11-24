import type { QuestRewardMode, QuestRewardShare } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import QuestRewardSummary from './QuestRewardSummary.vue'

interface StoryArgs {
    total: number
    mode?: QuestRewardMode
    shares?: QuestRewardShare[]
    playerId?: string
    completed?: boolean
}

const meta = {
    title: 'Entities/quests/QuestRewardSummary',
    args: {
        total: 40,
        mode: 'party_equal',
        shares: [
            { characterId: 'self', gold: 13 },
            { characterId: 'other', gold: 14 },
            { characterId: 'late', gold: 13 },
        ],
        playerId: 'self',
        completed: false,
    },
    argTypes: {
        total: { control: { type: 'number', min: 0, step: 1 } },
        mode: { control: 'select', options: ['party_equal', 'submitter'] },
        shares: { control: 'object' },
        playerId: { control: 'text' },
        completed: { control: 'boolean' },
    },
    render(args) {
        const host = renderVueStory(
            QuestRewardSummary,
            { ...args },
            { background: 'var(--ui-dark-panel-surface)' }
        )
        host.style.minHeight = '0'
        host.style.maxWidth = '480px'
        return host
    },
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}

export const Completed: Story = { args: { completed: true } }
