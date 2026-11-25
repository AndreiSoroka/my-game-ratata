import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { characterFixture, worldFixture } from '@/game/testing/characterFixture'
import { renderVueStory } from '@/shared/lib/storybook'

import GameWindows from './GameWindows.vue'

const player = characterFixture('adventurer')
type StoryArgs = InstanceType<typeof GameWindows>['$props']
const meta = {
    title: 'Pages/gameplay/GameWindows',
    args: {
        player,
        characters: [player],
        snapshot: worldFixture([player]),
        connected: true,
        defeated: false,
        abandoning: false,
        menuOpen: true,
        characterOpen: false,
        characterTab: 'stats',
    },
    argTypes: {
        player: { control: 'object' },
        characters: { control: 'object' },
        snapshot: { control: 'object' },
        connected: { control: 'boolean' },
        defeated: { control: 'boolean' },
        abandoning: { control: 'boolean' },
        menuOpen: { control: 'boolean' },
        characterOpen: { control: 'boolean' },
        characterTab: {
            options: ['stats', 'development', 'quests', 'crafting'],
            control: 'select',
        },
    },
    render: (args) => renderVueStory(GameWindows, args),
} satisfies Meta<StoryArgs>
export default meta

export const Default: StoryObj<StoryArgs> = {}
