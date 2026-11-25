<script setup lang="ts">
import type { ScenarioStep, ScenarioTrigger } from '@my-game-ratata/contracts'
import { computed } from 'vue'

import type { ScenarioFarmPlot } from '@/entities/scenarios'
import { scenarioStepLabels } from '@/entities/scenarios'
import { ScenarioFarmPlotField } from '@/entities/scenarios'
import { tGame } from '@/shared/lib/i18n'
import { UiInput, UiNumberInput, UiSelect } from '@/shared/ui/common'

const props = defineProps<{ main: ScenarioStep[]; plots: ScenarioFarmPlot[] }>()
const trigger = defineModel<ScenarioTrigger>({ required: true })
const triggers = computed((): Record<ScenarioTrigger['kind'], string> => ({
    enemy_visible: tGame('game.automation.enemyVisible'),
    friendly_nearby: tGame('game.automation.friendlyNearby'),
    inventory_full: tGame('game.automation.inventoryFull'),
    plot_ripe: tGame('game.automation.plotRipe'),
    step_result: tGame('game.automation.stepOutcome'),
}))
function selectValue(event: Event): string {
    return (event.target as HTMLSelectElement).value
}
function setKind(event: Event): void {
    const kind = selectValue(event) as ScenarioTrigger['kind']
    switch (kind) {
        case 'enemy_visible':
        case 'friendly_nearby':
            trigger.value = { kind, distanceTiles: 5 }
            break
        case 'inventory_full':
            trigger.value = { kind }
            break
        case 'plot_ripe': {
            const plot = props.plots[0]
            trigger.value = { kind, plotId: plot?.id ?? '', locationId: plot?.locationId ?? '' }
            break
        }
        case 'step_result':
            trigger.value = { kind, stepId: props.main[0]?.id ?? '', status: 'failed' }
    }
}
function setFollowGuard(event: Event): void {
    if (trigger.value.kind !== 'friendly_nearby') return
    if ((event.target as HTMLInputElement).checked) {
        trigger.value.onlyWhenNotFollowing = true
    } else {
        delete trigger.value.onlyWhenNotFollowing
    }
}
function setPlot(plot: ScenarioFarmPlot): void {
    trigger.value = { kind: 'plot_ripe', plotId: plot.id, locationId: plot.locationId }
}
function setStep(event: Event): void {
    if (trigger.value.kind === 'step_result') trigger.value.stepId = selectValue(event)
}
function setOutcome(event: Event): void {
    if (trigger.value.kind !== 'step_result') return
    trigger.value.status = selectValue(event) === 'succeeded' ? 'succeeded' : 'failed'
}
function isMainStep(id: string): boolean {
    return props.main.some((step) => step.id === id)
}
</script>

<template>
    <label>
        {{ tGame('game.automation.reactionTrigger') }}
        <UiSelect :border-width="4" :value="trigger.kind" @change="setKind($event)">
            <option v-for="(name, kind) in triggers" :key="kind" :value="kind">
                {{ name }}
            </option>
        </UiSelect>
    </label>
    <UiNumberInput
        v-if="trigger.kind === 'enemy_visible' || trigger.kind === 'friendly_nearby'"
        v-model="trigger.distanceTiles"
        :label="tGame('game.automation.distanceTiles')"
        :min="1"
        :max="64"
    />
    <label v-if="trigger.kind === 'friendly_nearby'" class="automation-checkbox">
        <UiInput
            type="checkbox"
            :checked="trigger.onlyWhenNotFollowing === true"
            @change="setFollowGuard($event)"
        />
        {{ tGame('game.automation.onlyWhenNotFollowing') }}
    </label>
    <ScenarioFarmPlotField
        v-if="trigger.kind === 'plot_ripe'"
        :plot-id="trigger.plotId"
        :location-id="trigger.locationId"
        :plots="plots"
        @change="setPlot($event)"
    />
    <template v-if="trigger.kind === 'step_result'">
        <label>
            {{ tGame('game.automation.triggerStep') }}
            <UiSelect :border-width="4" :value="trigger.stepId" @change="setStep($event)">
                <option v-if="!isMainStep(trigger.stepId)" :value="trigger.stepId" disabled>
                    {{ tGame('game.automation.missingStep') }}
                </option>
                <option v-for="(step, position) in main" :key="step.id" :value="step.id">
                    {{
                        tGame('game.automation.triggerStepOption', {
                            number: position + 1,
                            name: scenarioStepLabels[step.kind],
                        })
                    }}
                </option>
            </UiSelect>
        </label>
        <label>
            {{ tGame('game.automation.stepOutcome') }}
            <UiSelect :border-width="4" :value="trigger.status" @change="setOutcome($event)">
                <option value="succeeded">
                    {{ tGame('game.automation.stepSucceeded') }}
                </option>
                <option value="failed">
                    {{ tGame('game.automation.stepFailed') }}
                </option>
            </UiSelect>
        </label>
    </template>
</template>
