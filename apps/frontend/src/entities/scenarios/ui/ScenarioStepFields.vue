<script setup lang="ts">
import './scenarioPresentation.css'

import {
    type ItemId,
    itemIds,
    type MarkerDefinition,
    type ScenarioStep,
} from '@my-game-ratata/contracts'
import { computed } from 'vue'

import { itemName, tGame } from '@/shared/lib/i18n'
import { UiNumberInput } from '@/shared/ui/common'
import { UiSelect } from '@/shared/ui/common'

import {
    scenarioTargetKey,
    scenarioTargetLabel,
    type ScenarioVisibleTarget,
} from '../model/scenarioDestination'
import { newScenarioStep, scenarioSearchLabels, scenarioStepLabels } from '../model/scenarioEditor'
import ScenarioDestinationEditor from './ScenarioDestinationEditor.vue'

const props = defineProps<{
    modelValue: ScenarioStep
    markers: MarkerDefinition[]
    targets: ScenarioVisibleTarget[]
}>()
const emit = defineEmits<{ 'update:modelValue': [value: ScenarioStep] }>()
const chests = computed(() => props.targets.filter((entry) => entry.kind === 'chest'))
const explicitChestKey = computed(() => {
    const step = props.modelValue
    return step.kind === 'deposit' && step.chestId
        ? scenarioTargetKey({ id: step.chestId, locationId: step.locationId })
        : ''
})
const missingChest = computed(() => {
    const step = props.modelValue
    return (
        step.kind === 'deposit' &&
        step.chestId &&
        !chests.value.some((entry) => scenarioTargetKey(entry) === explicitChestKey.value)
    )
})
const resources = {
    get wood() {
        return tGame('game.character.timber')
    },
    get stone() {
        return tGame('game.character.stone')
    },
    get herbs() {
        return tGame('game.character.herbs')
    },
    get fiber() {
        return tGame('game.character.fiber')
    },
    get scrap() {
        return tGame('game.automation.scrapMetal')
    },
    get grain() {
        return tGame('game.automation.grain')
    },
    get brushwood() {
        return tGame('game.character.brushwood')
    },
}
function value(event: Event): string {
    return (event.target as HTMLInputElement).value
}
function kind(event: Event): void {
    const replacement = newScenarioStep(value(event) as ScenarioStep['kind'], props.markers)
    emit('update:modelValue', { ...replacement, id: props.modelValue.id })
}
function patch(fields: Record<string, unknown>): void {
    emit('update:modelValue', { ...props.modelValue, ...fields } as ScenarioStep)
}
function optionalItem(event: Event): void {
    const itemId = value(event)
    const step = { ...props.modelValue } as Extract<ScenarioStep, { kind: 'pickup' | 'search' }>
    delete step.itemId
    emit('update:modelValue', { ...step, ...(itemId ? { itemId: itemId as ItemId } : {}) })
}
function chest(event: Event): void {
    if (props.modelValue.kind !== 'deposit') return
    const key = value(event)
    const candidate = chests.value.find((entry) => scenarioTargetKey(entry) === key)
    if (key && !candidate) return
    const step = { ...props.modelValue }
    delete step.chestId
    delete step.locationId
    emit('update:modelValue', {
        ...step,
        ...(candidate
            ? {
                  chestId: candidate.id,
                  ...(candidate.locationId ? { locationId: candidate.locationId } : {}),
              }
            : {}),
    })
}
</script>

<template>
    <div class="automation-fields">
        <label>
            {{ tGame('game.automation.action') }}
            <UiSelect :border-width="4" :value="modelValue.kind" @change="kind">
                <option v-for="(label, id) in scenarioStepLabels" :key="id" :value="id">
                    {{ label }}
                </option>
            </UiSelect>
        </label>
        <ScenarioDestinationEditor
            v-if="modelValue.kind === 'go'"
            :model-value="modelValue.destination"
            :markers="markers"
            :targets="targets"
            @update:model-value="patch({ destination: $event })"
        />
        <template v-else-if="modelValue.kind === 'search'">
            <label>
                {{ tGame('game.automation.whatLookFor') }}
                <UiSelect
                    :border-width="4"
                    :value="modelValue.target"
                    @change="patch({ target: value($event) })"
                >
                    <option v-for="(label, id) in scenarioSearchLabels" :key="id" :value="id">
                        {{ label }}
                    </option>
                </UiSelect>
            </label>
            <p class="automation-muted">
                {{ tGame('game.automation.scansVisibleAreaNearbyWhile') }}
            </p>
        </template>
        <template v-else-if="modelValue.kind === 'gather'">
            <label>
                {{ tGame('game.automation.resource') }}
                <UiSelect
                    :border-width="4"
                    :value="modelValue.resource"
                    @change="patch({ resource: value($event) })"
                >
                    <option v-for="(label, id) in resources" :key="id" :value="id">
                        {{ label }}
                    </option>
                </UiSelect>
            </label>
            <label>
                {{ tGame('game.automation.howMuchGather') }}
                <UiSelect
                    :border-width="4"
                    :value="modelValue.amount === 'depleted' ? 'depleted' : 'count'"
                    @change="patch({ amount: value($event) === 'depleted' ? 'depleted' : 1 })"
                >
                    <option value="count">{{ tGame('game.automation.fixedAmount') }}</option>
                    <option value="depleted">
                        {{ tGame('game.automation.untilSourceRunsOut') }}
                    </option>
                </UiSelect>
            </label>
            <UiNumberInput
                v-if="modelValue.amount !== 'depleted'"
                :label="tGame('game.trade.quantity')"
                :min="1"
                :max="1000"
                :model-value="modelValue.amount"
                @update:model-value="patch({ amount: $event })"
            />
        </template>
        <p v-else-if="modelValue.kind === 'attack'" class="automation-muted">
            {{ tGame('game.automation.attacksValidVisibleEnemyUsing') }}
        </p>
        <template v-else-if="modelValue.kind === 'deposit'">
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
                <UiSelect
                    :border-width="4"
                    :value="modelValue.mode"
                    @change="patch({ mode: value($event) })"
                >
                    <option value="acquired">
                        {{ tGame('game.automation.onlyItemsCollectedDuringThis') }}
                    </option>
                    <option value="all">{{ tGame('game.automation.fromEntireBackpack') }}</option>
                </UiSelect>
            </label>
            <label>
                {{ tGame('game.automation.itemType') }}
                <UiSelect
                    :border-width="4"
                    :value="modelValue.itemIds[0] ?? ''"
                    @change="patch({ itemIds: value($event) ? [value($event)] : [] })"
                >
                    <option value="">{{ tGame('game.automation.allMatchingItems') }}</option>
                    <option v-for="id in itemIds" :key="id" :value="id">
                        {{ itemName(id) }}
                    </option>
                </UiSelect>
            </label>
        </template>
        <template v-else-if="modelValue.kind === 'wait'">
            <UiNumberInput
                :label="tGame('game.automation.seconds')"
                :min="1"
                :max="3600"
                :model-value="modelValue.durationMs / 1000"
                @update:model-value="patch({ durationMs: $event * 1000 })"
            />
        </template>
        <template v-else-if="modelValue.kind === 'recover'">
            <label>
                {{ tGame('game.automation.recover') }}
                <UiSelect
                    :border-width="4"
                    :value="modelValue.resource"
                    @change="patch({ resource: value($event) })"
                >
                    <option value="energy">{{ tGame('game.automation.energy') }}</option>
                    <option value="mana">{{ tGame('game.automation.mana') }}</option>
                    <option value="hp">{{ tGame('game.automation.health') }}</option>
                </UiSelect>
            </label>
            <UiNumberInput
                :label="tGame('game.automation.atLeastThisManyUnits')"
                :min="1"
                :max="10000"
                :model-value="modelValue.atLeast"
                @update:model-value="patch({ atLeast: $event })"
            />
        </template>
        <label
            v-if="
                modelValue.kind === 'pickup' ||
                (modelValue.kind === 'search' && modelValue.target === 'item')
            "
        >
            {{ tGame('game.automation.itemType') }}
            <UiSelect :border-width="4" :value="modelValue.itemId ?? ''" @change="optionalItem">
                <option value="">{{ tGame('game.automation.anyMatchingItem') }}</option>
                <option v-for="id in itemIds" :key="id" :value="id">
                    {{ itemName(id) }}
                </option>
            </UiSelect>
        </label>
    </div>
</template>
