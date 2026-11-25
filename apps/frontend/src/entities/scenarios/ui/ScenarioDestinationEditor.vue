<script setup lang="ts">
import './scenarioPresentation.css'

import type {
    MarkerDefinition,
    ScenarioDestination,
    ScenarioSearchKind,
} from '@my-game-ratata/contracts'
import { computed } from 'vue'

import { tGame } from '@/shared/lib/i18n'
import { UiSelect } from '@/shared/ui/common'

import {
    scenarioTargetKey,
    scenarioTargetLabel,
    type ScenarioVisibleTarget,
} from '../model/scenarioDestination'
import { scenarioSearchLabels } from '../model/scenarioEditor'

const props = defineProps<{
    modelValue: ScenarioDestination
    markers: MarkerDefinition[]
    targets: ScenarioVisibleTarget[]
}>()
const emit = defineEmits<{ 'update:modelValue': [value: ScenarioDestination] }>()
const selected = computed(() => {
    const destination = props.modelValue
    if (destination.kind === 'marker') return `marker:${destination.markerId}`
    if (destination.kind === 'visible') return `visible:${destination.target}`
    return 'point'
})
const candidates = computed(() => {
    const destination = props.modelValue
    return destination.kind === 'visible'
        ? props.targets.filter((target) => target.kind === destination.target)
        : []
})
const missingMarker = computed(() => {
    const destination = props.modelValue
    return (
        destination.kind === 'marker' &&
        !props.markers.some((marker) => marker.id === destination.markerId)
    )
})
const missingTarget = computed(() => {
    const destination = props.modelValue
    return (
        destination.kind === 'visible' &&
        destination.targetId &&
        !candidates.value.some((entry) => scenarioTargetKey(entry) === explicitKey.value)
    )
})
const explicitKey = computed(() => {
    const destination = props.modelValue
    return destination.kind === 'visible' && destination.targetId
        ? scenarioTargetKey({ id: destination.targetId, locationId: destination.locationId })
        : ''
})
function change(event: Event): void {
    const value = (event.target as HTMLSelectElement).value
    if (value.startsWith('marker:'))
        emit('update:modelValue', { kind: 'marker', markerId: value.slice(7) })
    else if (value.startsWith('visible:'))
        emit('update:modelValue', { kind: 'visible', target: value.slice(8) as ScenarioSearchKind })
}
function target(event: Event): void {
    if (props.modelValue.kind !== 'visible') return
    const key = (event.target as HTMLSelectElement).value
    const candidate = candidates.value.find((entry) => scenarioTargetKey(entry) === key)
    if (key && !candidate) return
    emit('update:modelValue', {
        kind: 'visible',
        target: props.modelValue.target,
        ...(props.modelValue.itemId ? { itemId: props.modelValue.itemId } : {}),
        ...(candidate
            ? {
                  targetId: candidate.id,
                  ...(candidate.locationId ? { locationId: candidate.locationId } : {}),
              }
            : {}),
    })
}
</script>

<template>
    <div class="automation-fields">
        <label>
            {{ tGame('game.automation.destination') }}
            <UiSelect :border-width="4" :value="selected" @change="change">
                <optgroup v-if="markers.length" :label="tGame('game.automation.markers')">
                    <option
                        v-for="marker in markers"
                        :key="marker.id"
                        :value="`marker:${marker.id}`"
                    >
                        {{ marker.number }} · {{ marker.name }}
                    </option>
                </optgroup>
                <option v-if="missingMarker" :value="selected" disabled>
                    {{
                        tGame(
                            modelValue.kind === 'marker' && !modelValue.markerId
                                ? 'game.automation.noMarkerSelected'
                                : 'game.automation.markerDeleted'
                        )
                    }}
                </option>
                <optgroup :label="tGame('game.automation.visibleTargetsNearby')">
                    <option
                        v-for="(label, kind) in scenarioSearchLabels"
                        :key="kind"
                        :value="`visible:${kind}`"
                    >
                        {{ label }}
                    </option>
                </optgroup>
                <option v-if="modelValue.kind === 'point'" value="point">
                    {{ tGame('game.automation.recordedPoint') }} {{ modelValue.locationId }}
                </option>
            </UiSelect>
        </label>
        <label v-if="modelValue.kind === 'visible'">
            {{ tGame('game.automation.targetSelection') }}
            <UiSelect :border-width="4" :value="explicitKey" @change="target">
                <option value="">{{ tGame('game.automation.nearestValidTarget') }}</option>
                <option
                    v-for="candidate in candidates"
                    :key="scenarioTargetKey(candidate)"
                    :value="scenarioTargetKey(candidate)"
                >
                    {{ scenarioTargetLabel(candidate) }}
                </option>
                <option v-if="missingTarget" :value="explicitKey" disabled>
                    {{ tGame('game.automation.selectedTargetIsCurrentlyOut') }}
                </option>
            </UiSelect>
        </label>
    </div>
</template>
