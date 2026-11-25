import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { characterFixture, worldFixture } from '@/game/testing/characterFixture'
import { renderVueStory } from '@/shared/lib/storybook'

import GameplayOverlay from './GameplayOverlay.vue'

const player = characterFixture('adventurer')
type StoryArgs = InstanceType<typeof GameplayOverlay>['$props']
const meta = {
    title: 'Pages/gameplay/GameplayOverlay',
    args: {
        player,
        characters: [player],
        snapshot: worldFixture([player]),
        blocked: false,
        interactionPrompt: 'F · Поговорить',
    },
    argTypes: {
        player: { control: 'object' },
        characters: { control: 'object' },
        snapshot: { control: 'object' },
        blocked: { control: 'boolean' },
        interactionPrompt: { control: 'text' },
        game: { control: false },
    },
    render: (args) => renderVueStory(GameplayOverlay, args),
} satisfies Meta<StoryArgs>
export default meta

export const Default: StoryObj<StoryArgs> = {}
