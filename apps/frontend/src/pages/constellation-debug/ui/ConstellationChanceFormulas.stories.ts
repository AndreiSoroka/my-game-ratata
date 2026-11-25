import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import ConstellationChanceFormulas from './ConstellationChanceFormulas.vue'

type StoryArgs = InstanceType<typeof ConstellationChanceFormulas>['$props']
const meta = {
    title: 'Pages/constellation-debug/ConstellationChanceFormulas',
    args: {
        legacy: [],
        details: [{ label: 'Шанс молитвы', expression: 'база + вера', variables: [] }],
    },
    argTypes: { details: { control: 'object' }, legacy: { control: 'object' } },
    render: (args) => renderVueStory(ConstellationChanceFormulas, args),
} satisfies Meta<StoryArgs>
export default meta

export const Default: StoryObj<StoryArgs> = {}
