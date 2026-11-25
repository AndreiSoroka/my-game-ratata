import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import ConstellationBuildSummary from './ConstellationBuildSummary.vue'

type StoryArgs = InstanceType<typeof ConstellationBuildSummary>['$props']
const meta = {
    title: 'Pages/constellation-debug/ConstellationBuildSummary',
    args: { nodeId: 'blade.root', activeIds: new Set(['blade.root']) },
    argTypes: {
        nodeId: { control: 'text' },
        path: { control: 'text' },
        activeIds: { control: false },
    },
    render: (args) => renderVueStory(ConstellationBuildSummary, args),
} satisfies Meta<StoryArgs>
export default meta

export const Default: StoryObj<StoryArgs> = {}
