import type { Meta, StoryObj } from '@storybook/web-components-vite'

import ConstellationDebugChance from '../debug/ConstellationDebugChance.vue'
import { renderVueStory } from './renderVueStory'

const meta = { title: 'Debug/Effect chance' } satisfies Meta
export default meta
type Story = StoryObj
function chanceStory(nodeId: string): HTMLElement {
    const host = renderVueStory(ConstellationDebugChance, { nodeId })
    host.style.maxWidth = '650px'
    return host
}
export const Prayer: Story = { render: () => chanceStory('prayer.root') }
export const Resurrection: Story = { render: () => chanceStory('prayer.revive') }
export const CriticalStrike: Story = { render: () => chanceStory('blade.critical') }
export const Theft: Story = { render: () => chanceStory('shadow.luck1') }
export const ConstantBonus: Story = { render: () => chanceStory('blade.damage1') }
