import type { MarkerDefinition, ScenarioStep } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h, ref } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'

import type { ScenarioVisibleTarget } from '../model/scenarioDestination'
import ScenarioStepFields from './ScenarioStepFields.vue'

type Args = {
    modelValue: ScenarioStep
    markers: MarkerDefinition[]
    targets: ScenarioVisibleTarget[]
}
const meta = {
    title: 'Entities/scenarios/ScenarioStepFields',
    parameters: { backgrounds: { disable: false } },
    args: {
        modelValue: { id: 'gather', kind: 'gather', resource: 'wood', amount: 3 },
        markers: [],
        targets: [],
    },
    render: (args) =>
        renderVueStory(
            {
                setup() {
                    const step = ref(args.modelValue)
                    return () =>
                        h(ScenarioStepFields, {
                            ...args,
                            modelValue: step.value,
                            'onUpdate:modelValue': (value) => {
                                step.value = value
                            },
                        })
                },
            },
            {}
        ),
} satisfies Meta<Args>
export default meta
type Story = StoryObj<Args>

export const Default: Story = {}
export const Waiting: Story = {
    args: { modelValue: { id: 'wait', kind: 'wait', durationMs: 5_000 } },
}
export const Deposit: Story = {
    args: { modelValue: { id: 'deposit', kind: 'deposit', itemIds: ['wood'], mode: 'acquired' } },
}
