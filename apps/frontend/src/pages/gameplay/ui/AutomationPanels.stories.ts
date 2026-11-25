import type { CharacterSnapshot, WorldSnapshot } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { automationFixture, scenarioRunFixture } from '@/game/testing/automationFixture'
import { characterFixture, worldFixture } from '@/game/testing/characterFixture'
import { renderVueStory } from '@/shared/lib/storybook'

import AutomationPanels from './AutomationPanels.vue'

const player = characterFixture('self')
const snapshot: WorldSnapshot = {
    ...worldFixture([player]),
    automation: { ...automationFixture(), run: scenarioRunFixture() },
}
type Args = {
    snapshot: WorldSnapshot
    player: CharacterSnapshot
    characters: CharacterSnapshot[]
    connected: boolean
    blocked: boolean
}
const meta = {
    title: 'Pages/gameplay/AutomationPanels',
    parameters: { backgrounds: { disable: false } },
    args: { snapshot, player, characters: [player], connected: true, blocked: false },
    render: (args) => renderVueStory(AutomationPanels, { ...args }),
} satisfies Meta<Args>
export default meta
type Story = StoryObj<Args>

export const Default: Story = {}
export const Disconnected: Story = { args: { connected: false } }
