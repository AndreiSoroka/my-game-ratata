import '../ui/rpgControls.css'

import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { automationFixture, scenarioRunFixture } from '../testing/automationFixture'
import MarkerPanel from '../ui/MarkerPanel.vue'
import ScenarioPanel from '../ui/ScenarioPanel.vue'
import ScenarioRunStatus from '../ui/ScenarioRunStatus.vue'
import { renderVueStory } from './renderVueStory'

const meta = { title: 'Shared/Automation' } satisfies Meta
export default meta
type Story = StoryObj

export const Markers: Story = {
    render: () =>
        renderVueStory(MarkerPanel, { markers: automationFixture().markers, available: true }),
}
export const EmptyMarkers: Story = {
    render: () => renderVueStory(MarkerPanel, { markers: [], available: true }),
}
export const LumberScenario: Story = {
    render: () =>
        renderVueStory(ScenarioPanel, {
            automation: automationFixture(),
            playerId: 'self',
            available: true,
            targets: [],
        }),
}
export const PausedRun: Story = {
    render: () =>
        renderVueStory(ScenarioRunStatus, {
            run: scenarioRunFixture({
                status: 'paused',
                reason: 'В рюкзаке нет места для добычи.',
                results: [
                    { stepId: 'go-tree', status: 'succeeded', failures: 0, reason: null },
                    {
                        stepId: 'wood',
                        status: 'failed',
                        failures: 3,
                        reason: 'В рюкзаке нет места для добычи.',
                    },
                ],
            }),
            canControl: true,
        }),
}
