import type {
    CharacterSnapshot,
    QuestOfferSnapshot,
    WhisperSnapshot,
} from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { questOfferFixture, whisperFixture } from '@/game/testing/socialFixtures'
import { renderVueStory } from '@/shared/lib/storybook'

import QuestOfferWindow from './QuestOfferWindow.vue'

const offer = questOfferFixture()
type Args = {
    offer: QuestOfferSnapshot
    characters: CharacterSnapshot[]
    serverTime: number
    playerId?: string
    conversation?: WhisperSnapshot | null
}
const meta = {
    title: 'Pages/gameplay/QuestOfferWindow',
    parameters: { backgrounds: { disable: false } },
    args: {
        offer,
        characters: [],
        serverTime: 1_000,
        playerId: 'self',
        conversation: null,
    },
    render: (args) => renderVueStory(QuestOfferWindow, { ...args }),
} satisfies Meta<Args>
export default meta
type Story = StoryObj<Args>

export const Default: Story = {}
export const Expired: Story = { args: { serverTime: offer.expiresAt } }
export const Conversation: Story = { args: { conversation: whisperFixture() } }
