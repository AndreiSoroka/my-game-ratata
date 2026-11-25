import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '../../../game/stories/renderVueStory'
import ConstellationDebugChance from './ConstellationDebugChance.vue'

interface StoryArgs {
    nodeId: string
    enabledIds: string[]
}
const meta = {
    title: 'Debug/Effect chance',
    args: { nodeId: 'prayer.root', enabledIds: ['prayer.root'] },
    argTypes: { nodeId: { control: 'text' }, enabledIds: { control: 'object' } },
    render: ({ nodeId, enabledIds }) => chanceStory(nodeId, enabledIds),
} satisfies Meta<StoryArgs>
export default meta
type Story = StoryObj<StoryArgs>
function chanceStory(nodeId: string, enabledIds?: string[]): HTMLElement {
    const host = renderVueStory(ConstellationDebugChance, {
        nodeId,
        enabledStarIds: enabledIds && new Set(enabledIds),
    })
    host.style.maxWidth = '650px'
    return host
}
export const Default: Story = {}
export const Prayer: Story = { render: () => chanceStory('prayer.root') }
export const Resurrection: Story = { render: () => chanceStory('prayer.revive') }
export const CriticalStrike: Story = { render: () => chanceStory('blade.critical') }
export const Theft: Story = { render: () => chanceStory('theft.root') }
export const ConstantBonus: Story = { render: () => chanceStory('blade.damage1') }

export const RoadPrayer: Story = { render: () => chanceStory('prayer_road.root') }
export const LanternPrayer: Story = { render: () => chanceStory('prayer_lantern.root') }
export const GravePrayer: Story = { render: () => chanceStory('prayer_grave.root') }
