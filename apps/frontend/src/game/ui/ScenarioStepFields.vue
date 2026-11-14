<script setup lang="ts">
import {
    ITEM_DEFINITIONS,
    type ItemId,
    itemIds,
    type MarkerDefinition,
    type ScenarioStep,
} from '@my-game-ratata/contracts'
import { computed } from 'vue'

import AutomationNumberField from './AutomationNumberField.vue'
import ScenarioDestinationEditor from './ScenarioDestinationEditor.vue'
import { newScenarioStep, scenarioSearchLabels, scenarioStepLabels } from './scenarioEditor'
import {
    scenarioTargetKey,
    scenarioTargetLabel,
    type ScenarioVisibleTarget,
} from './scenarioTargets'

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
    wood: 'Древесина',
    stone: 'Камень',
    herbs: 'Травы',
    fiber: 'Волокно',
    scrap: 'Металлолом',
    grain: 'Зерно',
    brushwood: 'Хворост',
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
            Действие
            <select :value="modelValue.kind" @change="kind">
                <option v-for="(label, id) in scenarioStepLabels" :key="id" :value="id">
                    {{ label }}
                </option>
            </select>
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
                Что искать
                <select :value="modelValue.target" @change="patch({ target: value($event) })">
                    <option v-for="(label, id) in scenarioSearchLabels" :key="id" :value="id">
                        {{ label }}
                    </option>
                </select>
            </label>
            <p class="automation-muted">Осматривает видимое пространство рядом. Не перемещается.</p>
        </template>
        <template v-else-if="modelValue.kind === 'gather'">
            <label>
                Ресурс
                <select :value="modelValue.resource" @change="patch({ resource: value($event) })">
                    <option v-for="(label, id) in resources" :key="id" :value="id">
                        {{ label }}
                    </option>
                </select>
            </label>
            <label>
                Сколько добывать
                <select
                    :value="modelValue.amount === 'depleted' ? 'depleted' : 'count'"
                    @change="patch({ amount: value($event) === 'depleted' ? 'depleted' : 1 })"
                >
                    <option value="count">Заданное количество</option>
                    <option value="depleted">До исчерпания источника</option>
                </select>
            </label>
            <AutomationNumberField
                v-if="modelValue.amount !== 'depleted'"
                label="Количество"
                :min="1"
                :max="1000"
                :model-value="modelValue.amount"
                @update:model-value="patch({ amount: $event })"
            />
        </template>
        <p v-else-if="modelValue.kind === 'attack'" class="automation-muted">
            Атакует подходящего видимого врага по обычным правилам боя.
        </p>
        <template v-else-if="modelValue.kind === 'deposit'">
            <label>
                Сундук
                <select :value="explicitChestKey" @change="chest">
                    <option value="">Ближайший видимый</option>
                    <option
                        v-for="target in chests"
                        :key="scenarioTargetKey(target)"
                        :value="scenarioTargetKey(target)"
                    >
                        {{ scenarioTargetLabel(target) }}
                    </option>
                    <option v-if="missingChest" :value="explicitChestKey" disabled>
                        Выбранный сундук сейчас не виден
                    </option>
                </select>
            </label>
            <label>
                Что переносить
                <select :value="modelValue.mode" @change="patch({ mode: value($event) })">
                    <option value="acquired">Только полученное за этот запуск</option>
                    <option value="all">Из всего рюкзака</option>
                </select>
            </label>
            <label>
                Тип предмета
                <select
                    :value="modelValue.itemIds[0] ?? ''"
                    @change="patch({ itemIds: value($event) ? [value($event)] : [] })"
                >
                    <option value="">Все подходящие предметы</option>
                    <option v-for="id in itemIds" :key="id" :value="id">
                        {{ ITEM_DEFINITIONS[id].name }}
                    </option>
                </select>
            </label>
        </template>
        <template v-else-if="modelValue.kind === 'wait'">
            <AutomationNumberField
                label="Секунд"
                :min="1"
                :max="3600"
                :model-value="modelValue.durationMs / 1000"
                @update:model-value="patch({ durationMs: $event * 1000 })"
            />
        </template>
        <template v-else-if="modelValue.kind === 'recover'">
            <label>
                Восстановить
                <select :value="modelValue.resource" @change="patch({ resource: value($event) })">
                    <option value="energy">Энергию</option>
                    <option value="mana">Ману</option>
                    <option value="hp">Здоровье</option>
                </select>
            </label>
            <AutomationNumberField
                label="Не меньше единиц"
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
            Тип предмета
            <select :value="modelValue.itemId ?? ''" @change="optionalItem">
                <option value="">Любой подходящий</option>
                <option v-for="id in itemIds" :key="id" :value="id">
                    {{ ITEM_DEFINITIONS[id].name }}
                </option>
            </select>
        </label>
    </div>
</template>
