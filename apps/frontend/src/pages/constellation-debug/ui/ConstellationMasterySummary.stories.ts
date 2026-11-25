import { heroClasses } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import ConstellationMasterySummary from './ConstellationMasterySummary.vue'

type StoryArgs = InstanceType<typeof ConstellationMasterySummary>['$props']
const meta = {
    title: 'Pages/constellation-debug/ConstellationMasterySummary',
    args: { path: 'magic', activeIds: new Set(['magic.root']), heroClass: 'arcanist' },
    argTypes: {
        path: { control: 'text' },
        activeIds: { control: false },
        heroClass: { options: heroClasses, control: 'select' },
    },
    render: (args) => renderVueStory(ConstellationMasterySummary, args),
} satisfies Meta<StoryArgs>
export default meta

export const Default: StoryObj<StoryArgs> = {}
