import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '../../../game/stories/renderVueStory'
import { characterFixture } from '../../../game/testing/characterFixture'
import DeathOverlay from './DeathOverlay.vue'

const character = characterFixture('fallen', {
    alive: false,
    life: { retired: false, reviveMsLeft: 45000, reviveUntil: 60000 },
})
type StoryArgs = Pick<
    InstanceType<typeof DeathOverlay>['$props'],
    'character' | 'defeated' | 'pending' | 'connected'
>
const meta = {
    title: 'Game/DeathOverlay',
    args: { character, defeated: false, pending: false, connected: true },
    argTypes: {
        character: { control: 'object' },
        defeated: { control: 'boolean' },
        pending: { control: 'boolean' },
        connected: { control: 'boolean' },
    },
    render: (args) => renderVueStory(DeathOverlay, args),
} satisfies Meta<StoryArgs>
export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}
export const Recoverable: Story = {}
export const EndingLife: Story = { args: { pending: true } }
export const Disconnected: Story = { args: { connected: false } }
export const FinalDeath: Story = { args: { character: undefined, defeated: true } }
