import {
    CENTER_LOCATION_ID,
    type MarkerDefinition,
    type ScenarioDestination,
} from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h, ref } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'

import type { ScenarioVisibleTarget } from '../model/scenarioDestination'
import ScenarioDestinationEditor from './ScenarioDestinationEditor.vue'

type Args = {
    modelValue: ScenarioDestination
    markers: MarkerDefinition[]
    targets: ScenarioVisibleTarget[]
}
const meta = {
    title: 'Entities/scenarios/ScenarioDestinationEditor',
    parameters: { backgrounds: { disable: false } },
    args: {
        modelValue: { kind: 'visible', target: 'tree' },
        markers: [
            {
                id: 'forest',
                name: 'Опушка',
                number: 1,
                locationId: CENTER_LOCATION_ID,
                position: { x: 420, y: 620 },
            },
        ],
        targets: [{ kind: 'tree', id: 'oak', label: 'Дуб', locationId: CENTER_LOCATION_ID }],
    },
    render: (args) =>
        renderVueStory(
            {
                setup() {
                    const destination = ref(args.modelValue)
                    return () =>
                        h(ScenarioDestinationEditor, {
                            ...args,
                            modelValue: destination.value,
                            'onUpdate:modelValue': (value) => {
                                destination.value = value
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
export const MissingTarget: Story = {
    args: { modelValue: { kind: 'visible', target: 'tree', targetId: 'oak-2' } },
}
