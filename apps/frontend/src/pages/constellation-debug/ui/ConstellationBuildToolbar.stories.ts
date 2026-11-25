import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import ConstellationBuildToolbar from './ConstellationBuildToolbar.vue'

type StoryArgs = InstanceType<typeof ConstellationBuildToolbar>['$props']
const meta = {
    title: 'Pages/constellation-debug/ConstellationBuildToolbar',
    args: { count: 3, total: 24 },
    argTypes: { count: { control: 'number' }, total: { control: 'number' } },
    render: (args) => renderVueStory(ConstellationBuildToolbar, args),
} satisfies Meta<StoryArgs>
export default meta

export const Default: StoryObj<StoryArgs> = {}
