import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import PlayerEffectDetails from './PlayerEffectDetails.vue'
import { presentPlayerEffects } from './playerEffectPresentation'

type StoryArgs = Pick<InstanceType<typeof PlayerEffectDetails>['$props'], 'effect'>

const meta = {
    title: 'Entities/player-effects/PlayerEffectDetails',
    args: {
        effect: presentPlayerEffects([
            { kind: 'ash-exhaustion', rank: 2, remainingMs: 998_000 },
        ])[0]!,
    },
    argTypes: { effect: { control: 'object' } },
    render: (args) => renderVueStory(PlayerEffectDetails, args),
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}

export const Untimed: Story = {
    args: { effect: presentPlayerEffects([{ kind: 'blacklisted' }])[0]! },
}
