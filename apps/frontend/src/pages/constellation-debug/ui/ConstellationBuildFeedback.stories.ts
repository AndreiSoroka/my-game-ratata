import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import ConstellationBuildFeedback from './ConstellationBuildFeedback.vue'

type StoryArgs = InstanceType<typeof ConstellationBuildFeedback>['$props']
const meta = {
    title: 'Pages/constellation-debug/ConstellationBuildFeedback',
    args: {
        feedback: {
            id: 1,
            text: 'Сначала откройте соседнюю звезду.',
            missingParents: ['magic.root'],
        },
        nodes: [],
    },
    argTypes: {
        feedback: { control: 'object' },
        cascade: { control: 'object' },
        nodes: { control: 'object' },
    },
    render: (args) => renderVueStory(ConstellationBuildFeedback, args),
} satisfies Meta<StoryArgs>
export default meta

export const Default: StoryObj<StoryArgs> = {}
