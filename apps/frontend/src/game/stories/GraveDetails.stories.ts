import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { graveFixture } from '../testing/graveFixture'
import GraveDetails from '../ui/GraveDetails.vue'
import { renderVueStory } from './renderVueStory'

const meta = { title: 'Shared/GraveDetails' } satisfies Meta
export default meta
type Story = StoryObj

export const Active: Story = {
    render: () => renderVueStory(GraveDetails, { grave: graveFixture(), serverTime: 1000 }),
}
export const PurificationProgress: Story = {
    render: () =>
        renderVueStory(GraveDetails, {
            grave: graveFixture({ purification: { completed: 3, required: 5 } }),
            serverTime: 1000,
        }),
}
export const Ruined: Story = {
    render: () =>
        renderVueStory(GraveDetails, {
            grave: graveFixture({
                phase: 'ruined',
                health: { kind: 'exact', current: 0, max: 100 },
                restoresAt: 1_201_000,
            }),
            serverTime: 1000,
        }),
}
export const Purified: Story = {
    render: () =>
        renderVueStory(GraveDetails, {
            grave: graveFixture({
                phase: 'purified',
                health: { kind: 'exact', current: 0, max: 100 },
            }),
            serverTime: 1000,
        }),
}
export const CompactTarget: Story = {
    render: () =>
        renderVueStory(GraveDetails, {
            grave: graveFixture({ health: { kind: 'exact', current: 0.05, max: 100 } }),
            serverTime: 1000,
            compact: true,
        }),
}
