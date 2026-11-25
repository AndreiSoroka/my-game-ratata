<script setup lang="ts">
import './scenarioPresentation.css'

import {
    type ItemId,
    itemIds,
    type MarkerDefinition,
    type ScenarioAbilityId,
    type ScenarioStep,
} from '@my-game-ratata/contracts'
import { computed } from 'vue'

import { itemName, tGame } from '@/shared/lib/i18n'
import { UiInput, UiNumberInput, UiSelect } from '@/shared/ui/common'

import { type ScenarioFarmPlot, type ScenarioVisibleTarget } from '../model/scenarioDestination'
import { newScenarioStep, scenarioSearchLabels, scenarioStepLabels } from '../model/scenarioEditor'
import ScenarioCombatStepFields from './ScenarioCombatStepFields.vue'
import ScenarioDepositStepFields from './ScenarioDepositStepFields.vue'
import ScenarioDestinationEditor from './ScenarioDestinationEditor.vue'
import ScenarioFarmPlotField from './ScenarioFarmPlotField.vue'

const props = withDefaults(
    defineProps<{
        modelValue: ScenarioStep
        markers: MarkerDefinition[]
        targets: ScenarioVisibleTarget[]
        plots?: ScenarioFarmPlot[]
        abilities?: ScenarioAbilityId[]
        kinds?: ScenarioStep['kind'][]
        allowReactionTarget?: boolean
    }>(),
    { plots: () => [], abilities: () => [] }
)
const emit = defineEmits<{ 'update:modelValue': [value: ScenarioStep] }>()
const allKinds = Object.keys(scenarioStepLabels) as ScenarioStep['kind'][]
const kinds = computed(() => props.kinds ?? allKinds)
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
    const replacement = newScenarioStep(
        value(event) as ScenarioStep['kind'],
        props.markers,
        props.plots,
        props.abilities
    )
    if (replacement) emit('update:modelValue', { ...replacement, id: props.modelValue.id })
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
function dash(event: Event): void {
    patch({ dash: (event.target as HTMLInputElement).checked || undefined })
}
</script>

<template>
    <div class="automation-fields">
        <label>
            {{ tGame('game.automation.action') }}
            <UiSelect :border-width="4" :value="modelValue.kind" @change="kind">
                <option v-if="!kinds.includes(modelValue.kind)" :value="modelValue.kind" disabled>
                    {{ scenarioStepLabels[modelValue.kind] }}
                </option>
                <option v-for="kindId in kinds" :key="kindId" :value="kindId">
                    {{ scenarioStepLabels[kindId] }}
                </option>
            </UiSelect>
        </label>
        <template v-if="modelValue.kind === 'go'">
            <ScenarioDestinationEditor
                :model-value="modelValue.destination"
                :markers="markers"
                :targets="targets"
                @update:model-value="patch({ destination: $event })"
            />
            <label class="automation-checkbox">
                <UiInput type="checkbox" :checked="modelValue.dash === true" @change="dash" />
                {{ tGame('game.automation.dash') }}
            </label>
        </template>
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
                :max="10000"
                :model-value="modelValue.amount"
                @update:model-value="patch({ amount: $event })"
            />
        </template>
        <ScenarioCombatStepFields
            v-else-if="
                modelValue.kind === 'attack' ||
                modelValue.kind === 'cast' ||
                modelValue.kind === 'follow'
            "
            :model-value="modelValue"
            :abilities="abilities"
            :allow-reaction-target="allowReactionTarget"
            @update:model-value="emit('update:modelValue', $event)"
        />
        <template v-else-if="modelValue.kind === 'farm'">
            <label>
                {{ tGame('game.automation.farm') }}
                <UiSelect
                    :border-width="4"
                    :value="modelValue.action"
                    @change="patch({ action: value($event) })"
                >
                    <option value="sow">{{ tGame('game.automation.sow') }}</option>
                    <option value="harvest">{{ tGame('game.automation.harvest') }}</option>
                </UiSelect>
            </label>
            <ScenarioFarmPlotField
                :plot-id="modelValue.plotId"
                :location-id="modelValue.locationId"
                :plots="plots"
                @change="(plot) => patch({ plotId: plot.id, locationId: plot.locationId })"
            />
        </template>
        <ScenarioDepositStepFields
            v-else-if="modelValue.kind === 'deposit'"
            :model-value="modelValue"
            :targets="targets"
            @update:model-value="emit('update:modelValue', $event)"
        />
        <template v-else-if="modelValue.kind === 'wait'">
            <UiNumberInput
                :label="tGame('game.automation.seconds')"
                :min="0"
                :max="3600"
                :decimals="3"
                :model-value="modelValue.durationMs / 1000"
                @update:model-value="patch({ durationMs: Math.round($event * 1000) })"
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
