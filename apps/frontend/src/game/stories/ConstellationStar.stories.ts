import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { constellationFixture, fixtureStarId } from '../testing/developmentFixture'
import ConstellationStarCard from '../ui/ConstellationStarCard.vue'
import { renderVueStory } from './renderVueStory'

const meta = { title: 'Interface/Constellation star' } satisfies Meta
export default meta
type Story = StoryObj
const node = (id: string) =>
    constellationFixture(true).nodes.find((node) => node.id === fixtureStarId(id))!
export const Prayer: Story = {
    render: () => renderVueStory(ConstellationStarCard, { node: node('prayer.root') }),
}
export const Resurrection: Story = {
    render: () => renderVueStory(ConstellationStarCard, { node: node('prayer.revive') }),
}
export const Unknown: Story = {
    render: () =>
        renderVueStory(ConstellationStarCard, {
            node: {
                ...node('prayer.revive'),
                unlocked: false,
                name: undefined,
                description: undefined,
                effectType: undefined,
                effects: undefined,
            },
        }),
}
