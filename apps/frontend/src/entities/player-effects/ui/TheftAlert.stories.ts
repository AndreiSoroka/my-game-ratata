import type { TheftAccusation } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import TheftAlert from './TheftAlert.vue'

const theft: TheftAccusation = {
    thiefId: 'suspect',
    thiefName: 'Ловкач',
    expiresAt: 126_000,
    canCallGuards: true,
    reported: false,
}
type Args = { evidence: TheftAccusation[]; alive: boolean; serverTime: number }
const meta = {
    title: 'Entities/player-effects/TheftAlert',
    parameters: { backgrounds: { disable: false } },
    args: { evidence: [theft], alive: true, serverTime: 100_000 },
    render: (args) => renderVueStory(TheftAlert, { ...args }),
} satisfies Meta<Args>
export default meta
type Story = StoryObj<Args>

export const Default: Story = {}
export const AssaultEvidence: Story = {
    args: { evidence: [{ ...theft, offense: 'attack', canCallGuards: false }] },
}
export const Expired: Story = { args: { serverTime: theft.expiresAt } }
