import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import GraveDetails from './GraveDetails.vue'

type Args = InstanceType<typeof GraveDetails>['$props']
const grave: Args['grave'] = {
    id: 'grave:one',
    buriedName: 'Мирослав',
    locationId: 'map-2-2',
    position: { x: 0, y: 24 },
    phase: 'active',
    health: { kind: 'exact', current: 99.75, max: 100 },
    material: 'stone',
}
const meta = {
    title: 'Entities/graves/GraveDetails',
    args: { grave, serverTime: 1000 },
    argTypes: {
        grave: { control: 'object' },
        serverTime: { control: 'number' },
    },
} satisfies Meta<Args>
export default meta
type Story = StoryObj<Args>

export const Default: Story = { render: (args) => renderVueStory(GraveDetails, args) }
export const Active: Story = { ...Default }
export const PurificationProgress: Story = {
    ...Default,
    args: { grave: { ...grave, purification: { completed: 3, required: 5 } } },
}
export const Ruined: Story = {
    ...Default,
    args: {
        grave: {
            ...grave,
            phase: 'ruined',
            health: { kind: 'exact', current: 0, max: 100 },
            restoresAt: 1_201_000,
        },
    },
}
export const Purified: Story = {
    ...Default,
    args: {
        grave: { ...grave, phase: 'purified', health: { kind: 'exact', current: 0, max: 100 } },
    },
}
export const FractionalHealth: Story = {
    ...Default,
    args: {
        grave: { ...grave, health: { kind: 'exact', current: 0.05, max: 100 } },
    },
}
