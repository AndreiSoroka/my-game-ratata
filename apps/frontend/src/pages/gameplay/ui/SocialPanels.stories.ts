import type { CharacterSnapshot, WorldSnapshot } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { characterFixture, worldFixture } from '@/game/testing/characterFixture'
import { exchangeFixture, whisperFixture } from '@/game/testing/socialFixtures'
import { renderVueStory } from '@/shared/lib/storybook'

import SocialPanels from './SocialPanels.vue'

const player = characterFixture('self')
type Args = {
    snapshot: WorldSnapshot
    player: CharacterSnapshot
    characters: CharacterSnapshot[]
    connected: boolean
}
const meta = {
    title: 'Pages/gameplay/SocialPanels',
    parameters: { backgrounds: { disable: false } },
    args: {
        player,
        characters: [player],
        snapshot: {
            ...worldFixture([player]),
            social: { whisper: whisperFixture(), exchange: null },
        },
        connected: true,
    },
    render: (args) => renderVueStory(SocialPanels, { ...args }),
} satisfies Meta<Args>
export default meta
type Story = StoryObj<Args>

export const Default: Story = {}
export const Invitation: Story = {
    args: {
        snapshot: {
            ...worldFixture([player]),
            social: {
                whisper: null,
                exchange: exchangeFixture({ status: 'invited', incoming: true }),
            },
        },
    },
}
