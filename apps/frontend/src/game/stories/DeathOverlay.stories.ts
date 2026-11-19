import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { characterFixture } from '../testing/characterFixture'
import DeathOverlay from '../ui/DeathOverlay.vue'
import { renderVueStory } from './renderVueStory'

const meta = { title: 'Shared/Fallen hero' } satisfies Meta
export default meta
type Story = StoryObj
const character = characterFixture('fallen', {
    alive: false,
    life: { retired: false, reviveMsLeft: 45000, reviveUntil: 60000 },
})
export const Recoverable: Story = {
    render: () => renderVueStory(DeathOverlay, { character, defeated: false }),
}
export const EndingLife: Story = {
    render: () => renderVueStory(DeathOverlay, { character, defeated: false, pending: true }),
}
export const Disconnected: Story = {
    render: () => renderVueStory(DeathOverlay, { character, defeated: false, connected: false }),
}
export const FinalDeath: Story = {
    render: () => renderVueStory(DeathOverlay, { character: undefined, defeated: true }),
}
