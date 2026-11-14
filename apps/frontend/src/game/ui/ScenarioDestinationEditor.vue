<script setup lang="ts">
import type {
    MarkerDefinition,
    ScenarioDestination,
    ScenarioSearchKind,
} from '@my-game-ratata/contracts'
import { computed } from 'vue'

import { scenarioSearchLabels } from './scenarioEditor'
import type { ScenarioVisibleTarget } from './scenarioTargets'

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
        !candidates.value.some((entry) => entry.id === destination.targetId)
    )
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
    const id = (event.target as HTMLSelectElement).value
    emit('update:modelValue', {
        kind: 'visible',
        target: props.modelValue.target,
        ...(id ? { targetId: id } : {}),
    })
}
</script>

<template>
    <div class="automation-fields">
        <label>
            Куда идти
            <select :value="selected" @change="change">
                <optgroup v-if="markers.length" label="Метки">
                    <option
                        v-for="marker in markers"
                        :key="marker.id"
                        :value="`marker:${marker.id}`"
                    >
                        {{ marker.number }} · {{ marker.name }}
                    </option>
                </optgroup>
                <option v-if="missingMarker" :value="selected" disabled>Метка удалена</option>
                <optgroup label="Видимые цели поблизости">
                    <option
                        v-for="(label, kind) in scenarioSearchLabels"
                        :key="kind"
                        :value="`visible:${kind}`"
                    >
                        {{ label }}
                    </option>
                </optgroup>
                <option v-if="modelValue.kind === 'point'" value="point">
                    Записанная точка · {{ modelValue.locationId }}
                </option>
            </select>
        </label>
        <label v-if="modelValue.kind === 'visible'">
            Выбор цели
            <select :value="modelValue.targetId ?? ''" @change="target">
                <option value="">Ближайшая подходящая</option>
                <option v-for="candidate in candidates" :key="candidate.id" :value="candidate.id">
                    {{ candidate.label }}
                </option>
                <option v-if="missingTarget" :value="modelValue.targetId" disabled>
                    Выбранная цель сейчас не видна
                </option>
            </select>
        </label>
    </div>
</template>
