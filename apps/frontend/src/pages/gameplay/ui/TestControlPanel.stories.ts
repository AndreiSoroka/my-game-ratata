import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { fn } from 'storybook/test'

import { characterFixture } from '@/game/testing/characterFixture'
import { renderVueStory } from '@/shared/lib/storybook'

import TestControlPanel from './TestControlPanel.vue'

type StoryArgs = InstanceType<typeof TestControlPanel>['$props']
const meta = {
    title: 'Pages/gameplay/TestControlPanel',
    args: {
        api: { send: fn(), stop: fn(), inventory: fn() },
        state: {
            connected: true,
            defeated: false,
            error: '',
            inventoryOpen: false,
            localPlayerId: 'adventurer',
            location: undefined,
            notice: '',
            player: characterFixture('adventurer'),
            snapshot: undefined,
            status: 'Connected',
        },
    },
    argTypes: { api: { control: false }, state: { control: 'object' } },
    render: (args) => renderVueStory(TestControlPanel, args),
} satisfies Meta<StoryArgs>
export default meta

export const Default: StoryObj<StoryArgs> = {}
