import {
    type AutomationSnapshot,
    buildScenarioFromTemplate,
    type ScenarioAbilityId,
} from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import type { ScenarioFarmPlot, ScenarioVisibleTarget } from '@/entities/scenarios'
import { automationFixture, scenarioRunFixture } from '@/game/testing/automationFixture'
import { renderVueStory } from '@/shared/lib/storybook'

import ScenarioPanel from './ScenarioPanel.vue'

type Args = {
    automation: AutomationSnapshot
    playerId: string
    available: boolean
    targets: ScenarioVisibleTarget[]
    plots?: ScenarioFarmPlot[]
    abilities?: ScenarioAbilityId[]
}
const meta = {
    title: 'Pages/gameplay/ScenarioPanel',
    parameters: { backgrounds: { disable: false } },
    args: { automation: automationFixture(), playerId: 'self', available: true, targets: [] },
    render: (args) => renderVueStory(ScenarioPanel, { ...args }),
} satisfies Meta<Args>
export default meta
type Story = StoryObj<Args>

export const Default: Story = {}
export const Running: Story = {
    args: { automation: { ...automationFixture(), run: scenarioRunFixture() } },
}
export const ReactionBuilder: Story = {
    args: {
        automation: {
            ...automationFixture(),
            scenarios: [
                buildScenarioFromTemplate('retreat', 'retreat', 'Отступление с прикрытием', {
                    shelterMarkerId: 'marker-1',
                    distanceTiles: 5,
                    abilityId: 'barrier',
                    dash: true,
                }),
            ],
        },
        abilities: ['barrier'],
    },
}
