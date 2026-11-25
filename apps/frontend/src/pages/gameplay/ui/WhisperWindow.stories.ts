import type { WhisperSnapshot } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { whisperFixture } from '@/game/testing/socialFixtures'
import { renderVueStory } from '@/shared/lib/storybook'

import WhisperWindow from './WhisperWindow.vue'

type Args = { conversation: WhisperSnapshot; playerId: string }
const meta = {
    title: 'Pages/gameplay/WhisperWindow',
    parameters: { backgrounds: { disable: false } },
    args: { conversation: whisperFixture(), playerId: 'self' },
    render: (args) => renderVueStory(WhisperWindow, { ...args }),
} satisfies Meta<Args>
export default meta
type Story = StoryObj<Args>

export const Default: Story = {}
export const Unavailable: Story = {
    args: { conversation: { ...whisperFixture(), available: false } },
}
