import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { graveFixture } from '../testing/graveFixture'
import GraveDetails from '../ui/GraveDetails.vue'
import { renderVueStory } from './renderVueStory'

const meta = { title: 'Interface/Grave' } satisfies Meta
export default meta
type Story = StoryObj

export const Active: Story = {
    render: () => renderVueStory(GraveDetails, { grave: graveFixture(), serverTime: 1000 }),
}
export const Ruined: Story = {
    render: () =>
        renderVueStory(GraveDetails, {
            grave: graveFixture({ phase: 'ruined', hp: 0, restoresAt: 1_201_000 }),
            serverTime: 1000,
        }),
}
export const Purified: Story = {
    render: () =>
        renderVueStory(GraveDetails, {
            grave: graveFixture({ phase: 'purified', hp: 0 }),
            serverTime: 1000,
        }),
}
export const CompactTarget: Story = {
    render: () =>
        renderVueStory(GraveDetails, {
            grave: graveFixture({ hp: 0.05 }),
            serverTime: 1000,
            compact: true,
        }),
}
