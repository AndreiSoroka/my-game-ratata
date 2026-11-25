<script setup lang="ts">
import './automationControls.css'

import type { AutomationCommand, AutomationSnapshot } from '@my-game-ratata/contracts'
import { computed, ref } from 'vue'

import {
    ScenarioRunStatus,
    ScenarioStepFields,
    scenarioStepLabels,
    type ScenarioVisibleTarget,
    useScenarioEditorStore,
} from '@/entities/scenarios'
import { tGame } from '@/shared/lib/i18n'
import { UiNumberInput } from '@/shared/ui/common'
import { UiButton } from '@/shared/ui/common'
import { UiFrame } from '@/shared/ui/common'
import { UiInput } from '@/shared/ui/common'
import { UiSelect } from '@/shared/ui/common'

import AutomationWindow from './AutomationWindow.vue'

const props = defineProps<{
    automation: AutomationSnapshot
    playerId: string
    available: boolean
    targets: ScenarioVisibleTarget[]
}>()
const emit = defineEmits<{ close: []; command: [command: AutomationCommand] }>()
const {
    draft,
    selectedId,
    saved,
    dirty,
    addKind,
    canSave,
    select,
    add,
    move,
    updateStep,
    removeStep,
    prepareSave,
} = useScenarioEditorStore(() => props.automation)
const targetId = ref('')
const selectedHelper = computed(() =>
    props.automation.helpers.find((entry) => entry.actorId === targetId.value)
)
const eligible = computed(() => !targetId.value || selectedHelper.value?.eligible === true)
const run = computed(() => (targetId.value ? selectedHelper.value?.run : props.automation.run))
const controls = computed(() => props.available && run.value?.ownerId === props.playerId)
function save(): void {
    if (props.available && canSave.value)
        emit('command', { type: 'scenario_save', scenario: prepareSave() })
}
function remove(): void {
    if (!props.available || !saved.value) return
    emit('command', { type: 'scenario_delete', scenarioId: saved.value.id })
    select('')
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
                    <UiSelect
                        :border-width="4"
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
                    </UiSelect>
                </label>
                <UiButton :disabled="automation.scenarios.length >= 16" @click="select('')">
                    {{ tGame('game.character.craft') }}
                </UiButton>
                <UiButton variant="danger" :disabled="!saved || !available" @click="remove">
                    {{ tGame('game.automation.deleteScenario') }}
                </UiButton>
            </div>
            <label>
                {{ tGame('game.automation.scenarioName') }}
                <UiInput :border-width="4" v-model="draft.name" maxlength="80" />
            </label>
            <div class="automation-row">
                <label>
                    {{ tGame('game.automation.repeat') }}
                    <UiSelect
                        :border-width="4"
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
                    </UiSelect>
                </label>
                <UiNumberInput
                    v-if="draft.repeat !== null && draft.repeat !== 1"
                    v-model="draft.repeat"
                    :label="tGame('game.automation.numberLoops')"
                    :min="2"
                    :max="1000"
                />
                <label>
                    {{ tGame('game.automation.whenEnemyIsNearby') }}
                    <UiSelect :border-width="4" v-model="draft.threat">
                        <option value="flee">{{ tGame('game.automation.retreat') }}</option>
                        <option value="attack">{{ tGame('game.automation.fight') }}</option>
                        <option value="continue">
                            {{ tGame('game.automation.continueScenario') }}
                        </option>
                    </UiSelect>
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
                    <UiFrame variant="panel" />
                    <div class="automation-row">
                        <h3>{{ tGame('game.automation.step') }} {{ index + 1 }}</h3>
                        <UiButton
                            icon
                            :disabled="index === 0"
                            :aria-label="tGame('game.automation.moveStepUp', { number: index + 1 })"
                            @click="move(index, -1)"
                        >
                            ↑
                        </UiButton>
                        <UiButton
                            icon
                            :disabled="index === draft.steps.length - 1"
                            :aria-label="
                                tGame('game.automation.moveStepDown', { number: index + 1 })
                            "
                            @click="move(index, 1)"
                        >
                            ↓
                        </UiButton>
                        <UiButton
                            variant="danger"
                            :aria-label="tGame('game.automation.removeStep', { number: index + 1 })"
                            @click="removeStep(index)"
                        >
                            {{ tGame('game.automation.delete') }}
                        </UiButton>
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
                    <UiSelect :border-width="4" v-model="addKind">
                        <option
                            v-for="(label, kind) in scenarioStepLabels"
                            :key="kind"
                            :value="kind"
                        >
                            {{ label }}
                        </option>
                    </UiSelect>
                </label>
                <UiButton :disabled="draft.steps.length >= 64" @click="add">
                    {{ tGame('game.automation.addStep') }}
                </UiButton>
                <UiButton
                    variant="primary"
                    :disabled="!available || !canSave || !dirty"
                    @click="save"
                >
                    {{ tGame('game.automation.save') }}
                </UiButton>
            </div>
            <label>
                {{ tGame('game.automation.whoRunsIt') }}
                <UiSelect :border-width="4" v-model="targetId">
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
                </UiSelect>
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
            <UiButton
                variant="primary"
                :disabled="!available || !saved || dirty || !eligible"
                @click="start"
            >
                {{ tGame('game.automation.run') }}
            </UiButton>
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
