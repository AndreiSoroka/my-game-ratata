import type { MarkerDefinition } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { automationFixture } from '@/game/testing/automationFixture'
import { renderVueStory } from '@/shared/lib/storybook'

import MarkerPanel from './MarkerPanel.vue'

type Args = { markers: MarkerDefinition[]; available: boolean }
const meta = {
    title: 'Pages/gameplay/MarkerPanel',
    parameters: { backgrounds: { disable: false } },
    args: { markers: automationFixture().markers, available: true },
    render: (args) => renderVueStory(MarkerPanel, { ...args }),
} satisfies Meta<Args>
export default meta
type Story = StoryObj<Args>

export const Default: Story = {}
export const Empty: Story = { args: { markers: [] } }
export const Unavailable: Story = { args: { available: false } }
