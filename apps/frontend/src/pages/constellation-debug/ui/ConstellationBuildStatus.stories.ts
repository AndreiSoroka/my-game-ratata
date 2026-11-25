import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import ConstellationBuildStatus from './ConstellationBuildStatus.vue'

type StoryArgs = InstanceType<typeof ConstellationBuildStatus>['$props']
const meta = {
    title: 'Pages/constellation-debug/ConstellationBuildStatus',
    args: { name: 'Искра', enabled: true },
    argTypes: { name: { control: 'text' }, enabled: { control: 'boolean' } },
    render: (args) => renderVueStory(ConstellationBuildStatus, args),
} satisfies Meta<StoryArgs>
export default meta

export const Default: StoryObj<StoryArgs> = {}
