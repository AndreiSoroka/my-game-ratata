<script setup lang="ts">
import { type ItemId, itemIds, type ScenarioStep } from '@my-game-ratata/contracts'
import { computed } from 'vue'

import { itemName, tGame } from '@/shared/lib/i18n'
import { UiSelect } from '@/shared/ui/common'

import {
    scenarioTargetKey,
    scenarioTargetLabel,
    type ScenarioVisibleTarget,
} from '../model/scenarioDestination'

const props = defineProps<{ targets: ScenarioVisibleTarget[] }>()
const modelValue = defineModel<Extract<ScenarioStep, { kind: 'deposit' }>>({ required: true })
const chests = computed(() => props.targets.filter((entry) => entry.kind === 'chest'))
const explicitChestKey = computed(() => {
    const step = modelValue.value
    return step.chestId ? scenarioTargetKey({ id: step.chestId, locationId: step.locationId }) : ''
})
const missingChest = computed(() => {
    const step = modelValue.value
    return (
        step.chestId &&
        !chests.value.some((entry) => scenarioTargetKey(entry) === explicitChestKey.value)
    )
})
function value(event: Event): string {
    return (event.target as HTMLSelectElement).value
}
function mode(event: Event): void {
    modelValue.value = { ...modelValue.value, mode: value(event) === 'all' ? 'all' : 'acquired' }
}
function items(event: Event): void {
    const id = value(event)
    modelValue.value = { ...modelValue.value, itemIds: id ? [id as ItemId] : [] }
}
function chest(event: Event): void {
    const key = value(event)
    const candidate = chests.value.find((entry) => scenarioTargetKey(entry) === key)
    if (key && !candidate) return
    const step = { ...modelValue.value }
    delete step.chestId
    delete step.locationId
    modelValue.value = {
        ...step,
        ...(candidate
            ? {
                  chestId: candidate.id,
                  ...(candidate.locationId ? { locationId: candidate.locationId } : {}),
              }
            : {}),
    }
}
</script>

<template>
    <label>
        {{ tGame('game.automation.chest') }}
        <UiSelect :border-width="4" :value="explicitChestKey" @change="chest">
            <option value="">{{ tGame('game.automation.nearestVisible') }}</option>
            <option
                v-for="target in chests"
                :key="scenarioTargetKey(target)"
                :value="scenarioTargetKey(target)"
            >
                {{ scenarioTargetLabel(target) }}
            </option>
            <option v-if="missingChest" :value="explicitChestKey" disabled>
                {{ tGame('game.automation.selectedChestIsCurrentlyOut') }}
            </option>
        </UiSelect>
    </label>
    <label>
        {{ tGame('game.automation.whatTransfer') }}
        <UiSelect :border-width="4" :value="modelValue.mode" @change="mode">
            <option value="acquired">
                {{ tGame('game.automation.onlyItemsCollectedDuringThis') }}
            </option>
            <option value="all">{{ tGame('game.automation.fromEntireBackpack') }}</option>
        </UiSelect>
    </label>
    <label>
        {{ tGame('game.automation.itemType') }}
        <UiSelect :border-width="4" :value="modelValue.itemIds[0] ?? ''" @change="items">
            <option value="">{{ tGame('game.automation.allMatchingItems') }}</option>
            <option v-for="id in itemIds" :key="id" :value="id">
                {{ itemName(id) }}
            </option>
        </UiSelect>
    </label>
</template>
