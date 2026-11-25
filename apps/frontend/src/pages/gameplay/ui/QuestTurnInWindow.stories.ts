import type { QuestTurnInPromptSnapshot, WhisperSnapshot } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { questTurnInFixture, whisperFixture } from '@/game/testing/socialFixtures'
import { renderVueStory } from '@/shared/lib/storybook'

import QuestTurnInWindow from './QuestTurnInWindow.vue'

const prompt = questTurnInFixture()
type Args = {
    prompt: QuestTurnInPromptSnapshot
    serverTime: number
    playerId: string
    conversation?: WhisperSnapshot | null
}
const meta = {
    title: 'Pages/gameplay/QuestTurnInWindow',
    parameters: { backgrounds: { disable: false } },
    args: { prompt, serverTime: 1000, playerId: 'self', conversation: null },
    render: (args) => renderVueStory(QuestTurnInWindow, { ...args }),
} satisfies Meta<Args>
export default meta
type Story = StoryObj<Args>

export const Default: Story = {}
export const Expired: Story = { args: { serverTime: prompt.expiresAt } }
export const Conversation: Story = {
    args: {
        conversation: {
            ...whisperFixture(),
            partnerId: prompt.issuerId,
            partnerName: prompt.issuerName,
        },
    },
}
