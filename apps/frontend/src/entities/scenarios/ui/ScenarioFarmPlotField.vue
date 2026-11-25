<script setup lang="ts">
import { computed } from 'vue'

import { tGame } from '@/shared/lib/i18n'
import { UiSelect } from '@/shared/ui/common'

import { type ScenarioFarmPlot, scenarioTargetKey } from '../model/scenarioDestination'

const props = defineProps<{
    plotId: string
    locationId: string
    plots: ScenarioFarmPlot[]
}>()
const emit = defineEmits<{ change: [plot: ScenarioFarmPlot] }>()
const key = computed(() => scenarioTargetKey({ id: props.plotId, locationId: props.locationId }))
const missing = computed(
    () => props.plotId && !props.plots.some((plot) => scenarioTargetKey(plot) === key.value)
)
function change(event: Event): void {
    const selected = (event.target as HTMLSelectElement).value
    const plot = props.plots.find((entry) => scenarioTargetKey(entry) === selected)
    if (plot) emit('change', plot)
}
</script>

<template>
    <label>
        {{ tGame('game.automation.farmPlot') }}
        <UiSelect :border-width="4" :value="plotId ? key : ''" @change="change">
            <option value="" disabled>{{ tGame('game.automation.selectPlot') }}</option>
            <option v-if="missing" :value="key" disabled>
                {{ tGame('game.automation.plotUnavailable') }}
            </option>
            <option
                v-for="plot in plots"
                :key="scenarioTargetKey(plot)"
                :value="scenarioTargetKey(plot)"
            >
                {{ plot.name }}
            </option>
        </UiSelect>
    </label>
</template>
