import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import ConstellationPrayerCalculator from './ConstellationPrayerCalculator.vue'

type StoryArgs = InstanceType<typeof ConstellationPrayerCalculator>['$props']
const meta = {
    title: 'Pages/constellation-debug/ConstellationPrayerCalculator',
    args: { nodeId: 'prayer.root', enabledStarIds: new Set(['prayer.root']) },
    argTypes: { nodeId: { control: 'text' }, enabledStarIds: { control: false } },
    render: (args) => renderVueStory(ConstellationPrayerCalculator, args),
} satisfies Meta<StoryArgs>
export default meta

export const Default: StoryObj<StoryArgs> = {}
