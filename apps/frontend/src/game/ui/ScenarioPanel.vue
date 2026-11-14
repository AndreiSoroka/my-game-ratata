<script setup lang="ts">
import './automationControls.css'

import type {
    AutomationCommand,
    AutomationSnapshot,
    ScenarioDefinition,
    ScenarioStep,
} from '@my-game-ratata/contracts'
import { computed, ref } from 'vue'

import AutomationNumberField from './AutomationNumberField.vue'
import AutomationWindow from './AutomationWindow.vue'
import {
    cloneScenario,
    moveScenarioStep,
    newScenario,
    newScenarioStep,
    sameScenario,
    scenarioStepLabels,
} from './scenarioEditor'
import ScenarioRunStatus from './ScenarioRunStatus.vue'
import ScenarioStepFields from './ScenarioStepFields.vue'
import type { ScenarioVisibleTarget } from './scenarioTargets'

const props = defineProps<{
    automation: AutomationSnapshot
    playerId: string
    available: boolean
    targets: ScenarioVisibleTarget[]
}>()
const emit = defineEmits<{ close: []; command: [command: AutomationCommand] }>()
const first = props.automation.scenarios[0]
const draft = ref<ScenarioDefinition>(first ? cloneScenario(first) : newScenario())
const selectedId = ref(first?.id ?? '')
const targetId = ref('')
const addKind = ref<ScenarioStep['kind']>('go')
const saved = computed(() =>
    props.automation.scenarios.find((entry) => entry.id === selectedId.value)
)
const dirty = computed(() => !sameScenario(draft.value, saved.value))
const selectedHelper = computed(() =>
    props.automation.helpers.find((entry) => entry.actorId === targetId.value)
)
const eligible = computed(() => !targetId.value || selectedHelper.value?.eligible === true)
const run = computed(() => (targetId.value ? selectedHelper.value?.run : props.automation.run))
const controls = computed(() => props.available && run.value?.ownerId === props.playerId)
const canSave = computed(
    () =>
        props.available &&
        draft.value.name.trim().length > 0 &&
        draft.value.steps.length > 0 &&
        (Boolean(saved.value) || props.automation.scenarios.length < 16)
)
function select(id: string): void {
    selectedId.value = id
    draft.value = cloneScenario(
        props.automation.scenarios.find((entry) => entry.id === id) ?? newScenario()
    )
}
function add(): void {
    if (draft.value.steps.length < 64)
        draft.value.steps.push(newScenarioStep(addKind.value, props.automation.markers))
}
function updateStep(index: number, step: ScenarioStep): void {
    draft.value.steps[index] = step
}
function save(): void {
    if (!canSave.value) return
    const scenario = cloneScenario(draft.value)
    scenario.name = scenario.name.trim()
    selectedId.value = scenario.id
    draft.value.name = scenario.name
    emit('command', { type: 'scenario_save', scenario })
}
function remove(): void {
    if (!saved.value) return
    emit('command', { type: 'scenario_delete', scenarioId: saved.value.id })
    selectedId.value = ''
    draft.value = newScenario()
}
function start(): void {
    if (!saved.value || dirty.value || !eligible.value) return
    emit('command', {
        type: 'scenario_start',
        scenarioId: saved.value.id,
        ...(targetId.value ? { targetId: targetId.value } : {}),
    })
}
function control(type: 'scenario_pause' | 'scenario_resume' | 'scenario_stop'): void {
    emit('command', { type, ...(targetId.value ? { targetId: targetId.value } : {}) })
}
function repeat(event: Event): void {
    const value = (event.target as HTMLSelectElement).value
    draft.value.repeat = value === 'forever' ? null : value === 'once' ? 1 : 2
}
</script>

<template>
    <AutomationWindow title="Сценарии" @close="emit('close')">
        <div class="automation-form">
            <div class="automation-row">
                <label>
                    Сохранённый сценарий
                    <select
                        :value="selectedId"
                        @change="select(($event.target as HTMLSelectElement).value)"
                    >
                        <option value="">Новый сценарий</option>
                        <option
                            v-for="scenario in automation.scenarios"
                            :key="scenario.id"
                            :value="scenario.id"
                        >
                            {{ scenario.name }}
                        </option>
                    </select>
                </label>
                <button
                    type="button"
                    :disabled="automation.scenarios.length >= 16"
                    @click="select('')"
                >
                    Создать
                </button>
                <button type="button" :disabled="!saved || !available" @click="remove">
                    Удалить сценарий
                </button>
            </div>
            <label>
                Название сценария
                <input v-model="draft.name" maxlength="80" />
            </label>
            <div class="automation-row">
                <label>
                    Повторение
                    <select
                        :value="
                            draft.repeat === null
                                ? 'forever'
                                : draft.repeat === 1
                                  ? 'once'
                                  : 'count'
                        "
                        @change="repeat"
                    >
                        <option value="once">Один раз</option>
                        <option value="count">Несколько раз</option>
                        <option value="forever">Без конца</option>
                    </select>
                </label>
                <AutomationNumberField
                    v-if="draft.repeat !== null && draft.repeat !== 1"
                    v-model="draft.repeat"
                    label="Число кругов"
                    :min="2"
                    :max="1000"
                />
                <label>
                    Если рядом враг
                    <select v-model="draft.threat">
                        <option value="flee">Отступить</option>
                        <option value="attack">Вступить в бой</option>
                        <option value="continue">Продолжать сценарий</option>
                    </select>
                </label>
            </div>
            <p class="automation-muted">
                Действия выбирают подходящие видимые цели рядом. Сначала «Идти», если нужно
                добраться до метки. Редактирование не меняет уже запущенную копию.
            </p>
            <ol class="automation-list scenario-steps" aria-label="Шаги сценария">
                <li v-for="(step, index) in draft.steps" :key="step.id" class="automation-card">
                    <div class="automation-row">
                        <h3>Шаг {{ index + 1 }}</h3>
                        <button
                            type="button"
                            :disabled="index === 0"
                            :aria-label="`Поднять шаг ${index + 1}`"
                            @click="draft.steps = moveScenarioStep(draft.steps, index, -1)"
                        >
                            ↑
                        </button>
                        <button
                            type="button"
                            :disabled="index === draft.steps.length - 1"
                            :aria-label="`Опустить шаг ${index + 1}`"
                            @click="draft.steps = moveScenarioStep(draft.steps, index, 1)"
                        >
                            ↓
                        </button>
                        <button
                            type="button"
                            :aria-label="`Удалить шаг ${index + 1}`"
                            @click="draft.steps.splice(index, 1)"
                        >
                            Удалить
                        </button>
                    </div>
                    <ScenarioStepFields
                        :model-value="step"
                        :markers="automation.markers"
                        :targets="targets"
                        @update:model-value="updateStep(index, $event)"
                    />
                </li>
            </ol>
            <div class="automation-row">
                <label>
                    Новый шаг
                    <select v-model="addKind">
                        <option
                            v-for="(label, kind) in scenarioStepLabels"
                            :key="kind"
                            :value="kind"
                        >
                            {{ label }}
                        </option>
                    </select>
                </label>
                <button type="button" :disabled="draft.steps.length >= 64" @click="add">
                    Добавить шаг
                </button>
                <button type="button" :disabled="!canSave || !dirty" @click="save">
                    Сохранить
                </button>
            </div>
            <label>
                Кто выполняет
                <select v-model="targetId">
                    <option value="">Мой персонаж</option>
                    <option
                        v-for="helper in automation.helpers"
                        :key="helper.actorId"
                        :value="helper.actorId"
                    >
                        {{ helper.name }}{{ helper.eligible ? '' : ' · пока не поможет' }}
                    </option>
                </select>
            </label>
            <p v-if="selectedHelper?.reason" class="automation-muted">
                {{ selectedHelper.reason }}
            </p>
            <p v-if="selectedHelper" class="automation-muted">
                {{ selectedHelper.canFight ? 'Может сражаться' : 'Не сражается' }} ·
                {{ selectedHelper.canFollow ? 'Может путешествовать' : 'Остаётся у своего поста' }}
            </p>
            <p v-if="dirty" class="automation-muted">Сохраните изменения перед запуском.</p>
            <button
                type="button"
                :disabled="!available || !saved || dirty || !eligible"
                @click="start"
            >
                Запустить
            </button>
            <ScenarioRunStatus
                v-if="run"
                :run="run"
                :can-control="controls"
                @pause="control('scenario_pause')"
                @resume="control('scenario_resume')"
                @stop="control('scenario_stop')"
            />
        </div>
    </AutomationWindow>
</template>

<style scoped>
.scenario-steps {
    padding: 0;
    margin: 0;
    list-style: none;
}
</style>
