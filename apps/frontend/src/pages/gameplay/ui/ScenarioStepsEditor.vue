<script setup lang="ts">
import {
    type MarkerDefinition,
    SCENARIO_MAX_STEPS,
    type ScenarioAbilityId,
    type ScenarioStep,
} from '@my-game-ratata/contracts'
import { computed, nextTick, ref } from 'vue'

import type { ScenarioFarmPlot, ScenarioVisibleTarget } from '@/entities/scenarios'
import { moveScenarioEntry, newScenarioStep, scenarioStepLabels } from '@/entities/scenarios'
import { ScenarioStepFields } from '@/entities/scenarios'
import { tGame } from '@/shared/lib/i18n'
import { UiButton, UiFrame, UiSelect } from '@/shared/ui/common'

const props = defineProps<{
    label: string
    markers: MarkerDefinition[]
    targets: ScenarioVisibleTarget[]
    plots: ScenarioFarmPlot[]
    abilities: ScenarioAbilityId[]
    allowReactionTarget?: boolean
    remainingSteps: number
}>()
const steps = defineModel<ScenarioStep[]>({ required: true })
const addKind = ref<ScenarioStep['kind']>('go')
const list = ref<HTMLOListElement>()
const newStep = ref<{ focus: () => void }>()
const kinds = computed(() => {
    return (Object.keys(scenarioStepLabels) as ScenarioStep['kind'][]).filter(
        (kind) =>
            (kind !== 'cast' || props.abilities.length > 0) &&
            (kind !== 'farm' || props.plots.length > 0)
    )
})
function add(): void {
    if (
        props.remainingSteps <= 0 ||
        steps.value.length >= SCENARIO_MAX_STEPS ||
        !kinds.value.includes(addKind.value)
    )
        return
    const step = newScenarioStep(addKind.value, props.markers, props.plots, props.abilities)
    if (step) steps.value = [...steps.value, step]
}
function updateStep(index: number, step: ScenarioStep): void {
    steps.value = steps.value.map((entry, position) => (position === index ? step : entry))
}
async function remove(index: number): Promise<void> {
    steps.value = steps.value.filter((_, position) => position !== index)
    await nextTick()
    const row = list.value?.children.item(Math.min(index, steps.value.length - 1))
    if (row) row.querySelector('select')?.focus()
    else newStep.value?.focus()
}
async function move(index: number, direction: -1 | 1): Promise<void> {
    steps.value = moveScenarioEntry(steps.value, index, direction)
    await nextTick()
    const row = list.value?.children.item(index + direction)
    const sameDirection = row?.querySelector<HTMLButtonElement>(
        `button[data-step-direction="${direction}"]:not(:disabled)`
    )
    const button =
        sameDirection ??
        row?.querySelector<HTMLButtonElement>('button[data-step-direction]:not(:disabled)')
    button?.focus()
}
</script>

<template>
    <ol ref="list" class="automation-list scenario-steps" :aria-label="label">
        <li v-for="(step, index) in steps" :key="step.id" class="automation-card game-frame-host">
            <UiFrame variant="panel" />
            <div class="automation-row">
                <h4>{{ tGame('game.automation.step') }} {{ index + 1 }}</h4>
                <UiButton
                    icon
                    data-step-direction="-1"
                    :disabled="index === 0"
                    :aria-label="tGame('game.automation.moveStepUp', { number: index + 1 })"
                    @click="move(index, -1)"
                >
                    ↑
                </UiButton>
                <UiButton
                    icon
                    data-step-direction="1"
                    :disabled="index === steps.length - 1"
                    :aria-label="tGame('game.automation.moveStepDown', { number: index + 1 })"
                    @click="move(index, 1)"
                >
                    ↓
                </UiButton>
                <UiButton
                    variant="danger"
                    :aria-label="tGame('game.automation.removeStep', { number: index + 1 })"
                    @click="remove(index)"
                >
                    {{ tGame('game.automation.delete') }}
                </UiButton>
            </div>
            <ScenarioStepFields
                :model-value="step"
                :markers="markers"
                :targets="targets"
                :plots="plots"
                :abilities="abilities"
                :kinds="kinds"
                :allow-reaction-target="allowReactionTarget"
                @update:model-value="updateStep(index, $event)"
            />
        </li>
    </ol>
    <div class="automation-row">
        <label>
            {{ tGame('game.automation.newStep') }}
            <UiSelect :border-width="4" ref="newStep" v-model="addKind">
                <option v-for="kind in kinds" :key="kind" :value="kind">
                    {{ scenarioStepLabels[kind] }}
                </option>
            </UiSelect>
        </label>
        <UiButton :disabled="remainingSteps <= 0 || !kinds.includes(addKind)" @click="add">
            {{ tGame('game.automation.addStep') }}
        </UiButton>
    </div>
</template>

<style scoped>
.scenario-steps {
    padding: 0;
    margin: 0;
    list-style: none;
}
h4 {
    margin: 0;
}
</style>
