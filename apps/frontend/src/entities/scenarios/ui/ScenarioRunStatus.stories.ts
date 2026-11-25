import type { ScenarioRunSnapshot } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import ScenarioRunStatus from './ScenarioRunStatus.vue'

const run: ScenarioRunSnapshot = {
    scenarioId: 'lumber',
    name: 'Древесина в сундук',
    actorId: 'self',
    ownerId: 'self',
    status: 'running',
    stepIndex: 1,
    iteration: 1,
    remainingFailureMs: 0,
    reason: null,
    interruption: null,
    results: [
        { stepId: 'walk', status: 'succeeded', reason: null, failures: 0 },
        { stepId: 'wood', status: 'running', reason: null, failures: 0 },
        { stepId: 'stash', status: 'pending', reason: null, failures: 0 },
    ],
}
type Args = {
    run: ScenarioRunSnapshot
    actorName?: string
    compact?: boolean
    canControl?: boolean
}
const meta = {
    title: 'Entities/scenarios/ScenarioRunStatus',
    parameters: { backgrounds: { disable: false } },
    args: { run, actorName: 'Мира', compact: false, canControl: true },
    render: (args) => renderVueStory(ScenarioRunStatus, { ...args }),
} satisfies Meta<Args>
export default meta
type Story = StoryObj<Args>

export const Default: Story = {}
export const Compact: Story = { args: { compact: true } }
export const Paused: Story = {
    args: { run: { ...run, status: 'paused', reason: 'В рюкзаке нет места для добычи.' } },
}
