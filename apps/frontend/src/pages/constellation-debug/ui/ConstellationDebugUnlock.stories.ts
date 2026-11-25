import { heroClasses } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import ConstellationDebugUnlock from './ConstellationDebugUnlock.vue'

type StoryArgs = InstanceType<typeof ConstellationDebugUnlock>['$props']
const meta = {
    title: 'Pages/constellation-debug/ConstellationDebugUnlock',
    args: { nodeId: 'magic.spark', heroClass: 'arcanist', activeIds: new Set(['magic.root']) },
    argTypes: {
        nodeId: { control: 'text' },
        heroClass: { options: heroClasses, control: 'select' },
        activeIds: { control: false },
    },
    render: (args) => renderVueStory(ConstellationDebugUnlock, args),
} satisfies Meta<StoryArgs>
export default meta

export const Default: StoryObj<StoryArgs> = {}
