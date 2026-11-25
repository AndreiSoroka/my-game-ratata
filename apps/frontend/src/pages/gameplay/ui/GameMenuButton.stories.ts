import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import GameMenuButton from './GameMenuButton.vue'

type StoryArgs = InstanceType<typeof GameMenuButton>['$props']
const meta = {
    title: 'Pages/gameplay/GameMenuButton',
    args: {},
    argTypes: {},
    render: (args) => renderVueStory(GameMenuButton, args),
} satisfies Meta<StoryArgs>
export default meta

export const Default: StoryObj<StoryArgs> = {}
