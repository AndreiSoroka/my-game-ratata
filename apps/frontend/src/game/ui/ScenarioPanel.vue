<script setup lang="ts">
import './automationControls.css'

import type {
    AutomationCommand,
    AutomationSnapshot,
    ScenarioDefinition,
    ScenarioStep,
} from '@my-game-ratata/contracts'
import { computed, ref } from 'vue'

import { tGame } from '@/shared/lib/i18n'

import AutomationNumberField from './AutomationNumberField.vue'
import AutomationWindow from './AutomationWindow.vue'
import GameButton from './primitives/GameButton.vue'
import GameFrame from './primitives/GameFrame.vue'
import GameInput from './primitives/GameInput.vue'
import GameSelect from './primitives/GameSelect.vue'
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
    <AutomationWindow :title="tGame('game.automation.scenarios')" @close="emit('close')">
        <div class="automation-form">
            <div class="automation-row">
                <label>
                    {{ tGame('game.automation.savedScenario') }}
                    <GameSelect
                        :value="selectedId"
                        @change="select(($event.target as HTMLSelectElement).value)"
                    >
                        <option value="">{{ tGame('game.automation.newScenario') }}</option>
                        <option
                            v-for="scenario in automation.scenarios"
                            :key="scenario.id"
                            :value="scenario.id"
                        >
                            {{ scenario.name }}
                        </option>
                    </GameSelect>
                </label>
                <GameButton :disabled="automation.scenarios.length >= 16" @click="select('')">
                    {{ tGame('game.character.craft') }}
                </GameButton>
                <GameButton variant="danger" :disabled="!saved || !available" @click="remove">
                    {{ tGame('game.automation.deleteScenario') }}
                </GameButton>
            </div>
            <label>
                {{ tGame('game.automation.scenarioName') }}
                <GameInput v-model="draft.name" maxlength="80" />
            </label>
            <div class="automation-row">
                <label>
                    {{ tGame('game.automation.repeat') }}
                    <GameSelect
                        :value="
                            draft.repeat === null
                                ? 'forever'
                                : draft.repeat === 1
                                  ? 'once'
                                  : 'count'
                        "
                        @change="repeat"
                    >
                        <option value="once">{{ tGame('game.automation.once') }}</option>
                        <option value="count">{{ tGame('game.automation.severalTimes') }}</option>
                        <option value="forever">{{ tGame('game.automation.indefinitely') }}</option>
                    </GameSelect>
                </label>
                <AutomationNumberField
                    v-if="draft.repeat !== null && draft.repeat !== 1"
                    v-model="draft.repeat"
                    :label="tGame('game.automation.numberLoops')"
                    :min="2"
                    :max="1000"
                />
                <label>
                    {{ tGame('game.automation.whenEnemyIsNearby') }}
                    <GameSelect v-model="draft.threat">
                        <option value="flee">{{ tGame('game.automation.retreat') }}</option>
                        <option value="attack">{{ tGame('game.automation.fight') }}</option>
                        <option value="continue">
                            {{ tGame('game.automation.continueScenario') }}
                        </option>
                    </GameSelect>
                </label>
            </div>
            <p class="automation-muted">
                {{ tGame('game.automation.actionsChooseValidVisibleTargets') }}
            </p>
            <ol
                class="automation-list scenario-steps"
                :aria-label="tGame('game.automation.scenarioSteps')"
            >
                <li
                    v-for="(step, index) in draft.steps"
                    :key="step.id"
                    class="automation-card game-frame-host"
                >
                    <GameFrame variant="panel" />
                    <div class="automation-row">
                        <h3>{{ tGame('game.automation.step') }} {{ index + 1 }}</h3>
                        <GameButton
                            icon
                            :disabled="index === 0"
                            :aria-label="tGame('game.automation.moveStepUp', { number: index + 1 })"
                            @click="draft.steps = moveScenarioStep(draft.steps, index, -1)"
                        >
                            ↑
                        </GameButton>
                        <GameButton
                            icon
                            :disabled="index === draft.steps.length - 1"
                            :aria-label="
                                tGame('game.automation.moveStepDown', { number: index + 1 })
                            "
                            @click="draft.steps = moveScenarioStep(draft.steps, index, 1)"
                        >
                            ↓
                        </GameButton>
                        <GameButton
                            variant="danger"
                            :aria-label="tGame('game.automation.removeStep', { number: index + 1 })"
                            @click="draft.steps.splice(index, 1)"
                        >
                            {{ tGame('game.automation.delete') }}
                        </GameButton>
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
                    {{ tGame('game.automation.newStep') }}
                    <GameSelect v-model="addKind">
                        <option
                            v-for="(label, kind) in scenarioStepLabels"
                            :key="kind"
                            :value="kind"
                        >
                            {{ label }}
                        </option>
                    </GameSelect>
                </label>
                <GameButton :disabled="draft.steps.length >= 64" @click="add">
                    {{ tGame('game.automation.addStep') }}
                </GameButton>
                <GameButton variant="primary" :disabled="!canSave || !dirty" @click="save">
                    {{ tGame('game.automation.save') }}
                </GameButton>
            </div>
            <label>
                {{ tGame('game.automation.whoRunsIt') }}
                <GameSelect v-model="targetId">
                    <option value="">{{ tGame('game.automation.myCharacter') }}</option>
                    <option
                        v-for="helper in automation.helpers"
                        :key="helper.actorId"
                        :value="helper.actorId"
                    >
                        {{ helper.name
                        }}{{
                            helper.eligible ? '' : tGame('game.automation.helperUnavailableSuffix')
                        }}
                    </option>
                </GameSelect>
            </label>
            <p v-if="selectedHelper?.reason" class="automation-muted">
                {{ selectedHelper.reason }}
            </p>
            <p v-if="selectedHelper" class="automation-muted">
                {{
                    selectedHelper.canFollow
                        ? tGame('game.automation.helperCanTravel')
                        : tGame('game.automation.helperStaysAtPost')
                }}
            </p>
            <p v-if="dirty" class="automation-muted">
                {{ tGame('game.automation.saveYourChangesBeforeRunning') }}
            </p>
            <GameButton
                variant="primary"
                :disabled="!available || !saved || dirty || !eligible"
                @click="start"
            >
                {{ tGame('game.automation.run') }}
            </GameButton>
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
