import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import ConstellationPrayerBuild from './ConstellationPrayerBuild.vue'

type StoryArgs = InstanceType<typeof ConstellationPrayerBuild>['$props']
const meta = {
    title: 'Pages/constellation-debug/ConstellationPrayerBuild',
    args: {
        passive: false,
        result: {
            available: true,
            effects: ['Восстанавливает здоровье союзников.'],
            metrics: [{ label: 'Максимум целей', value: '3' }],
        },
    },
    argTypes: { passive: { control: 'boolean' }, result: { control: 'object' } },
    render: (args) => renderVueStory(ConstellationPrayerBuild, args),
} satisfies Meta<StoryArgs>
export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}
export const Unavailable: Story = {
    args: { result: { available: false, effects: [], metrics: [] } },
}
