<script setup lang="ts">
import './automationControls.css'

import type {
    AutomationCommand,
    AutomationSnapshot,
    ScenarioAbilityId,
} from '@my-game-ratata/contracts'
import { computed, ref } from 'vue'

import type { ScenarioFarmPlot, ScenarioVisibleTarget } from '@/entities/scenarios'
import { ScenarioRunStatus } from '@/entities/scenarios'
import { tGame } from '@/shared/lib/i18n'
import { UiButton, UiInput, UiNumberInput, UiSelect } from '@/shared/ui/common'

import { useScenarioDraft } from '../model/useScenarioDraft'
import AutomationWindow from './AutomationWindow.vue'
import ScenarioPseudocodeEditor from './ScenarioPseudocodeEditor.vue'
import ScenarioRulesEditor from './ScenarioRulesEditor.vue'
import ScenarioStepsEditor from './ScenarioStepsEditor.vue'
import ScenarioTemplateLibrary from './ScenarioTemplateLibrary.vue'

const props = withDefaults(
    defineProps<{
        automation: AutomationSnapshot
        playerId: string
        available: boolean
        targets: ScenarioVisibleTarget[]
        plots?: ScenarioFarmPlot[]
        abilities?: ScenarioAbilityId[]
        serverTime?: number
    }>(),
    { plots: () => [], abilities: () => [] }
)
const emit = defineEmits<{ close: []; command: [command: AutomationCommand] }>()
const {
    draft,
    selectedId,
    saved,
    dirty,
    full,
    remainingSteps,
    section,
    mode,
    scenarioName,
    textEditor,
    text,
    textDirty,
    textError,
    saveError,
    editorHint,
    discardAction,
    discardPrompt,
    canSave,
    newDraft,
    select,
    copySaved,
    copyTemplate,
    resetText,
    editText,
    applyText,
    save,
    remove,
    repeat,
    guardClose,
    keepEditing,
    discard,
} = useScenarioDraft(props, (command) => emit('command', command))
const targetId = ref('')
const selectedHelper = computed(() =>
    props.automation.helpers.find((entry) => entry.actorId === targetId.value)
)
const eligible = computed(() => !targetId.value || selectedHelper.value?.eligible === true)
const run = computed(() => (targetId.value ? selectedHelper.value?.run : props.automation.run))
const controls = computed(() => props.available && run.value?.ownerId === props.playerId)
const canStart = computed(
    () => props.available && saved.value && !dirty.value && !textDirty.value && eligible.value
)

function start(): void {
    if (!canStart.value || !saved.value) return
    emit('command', {
        type: 'scenario_start',
        scenarioId: saved.value.id,
        ...(targetId.value ? { targetId: targetId.value } : {}),
    })
}
function control(type: 'scenario_pause' | 'scenario_resume' | 'scenario_stop'): void {
    emit('command', { type, ...(targetId.value ? { targetId: targetId.value } : {}) })
}
const close = () => guardClose(() => emit('close'))
</script>

<template>
    <AutomationWindow :title="tGame('game.automation.scenarios')" @close="close">
        <div class="automation-form">
            <div class="automation-row">
                <UiButton
                    :aria-pressed="section === 'own'"
                    :highlighted="section === 'own'"
                    @click="section = 'own'"
                >
                    {{ tGame('game.automation.myScenarios') }}
                </UiButton>
                <UiButton
                    :aria-pressed="section === 'templates'"
                    :highlighted="section === 'templates'"
                    @click="section = 'templates'"
                >
                    {{ tGame('game.automation.readyTemplates') }}
                </UiButton>
            </div>
            <div v-if="discardAction" ref="discardPrompt" class="automation-fields">
                <p role="alert">{{ tGame('game.automation.discardScenarioDraft') }}</p>
                <div class="automation-row">
                    <UiButton @click="keepEditing">{{
                        tGame('game.automation.keepEditing')
                    }}</UiButton>
                    <UiButton variant="danger" @click="discard">
                        {{ tGame('game.automation.discardDraft') }}
                    </UiButton>
                </div>
            </div>
            <ScenarioTemplateLibrary
                v-if="section === 'templates'"
                :markers="automation.markers"
                :plots="plots"
                :abilities="abilities"
                :full="full"
                @copy="copyTemplate"
            />
            <template v-else>
                <div class="automation-row">
                    <label>
                        {{ tGame('game.automation.savedScenario') }}
                        <UiSelect :border-width="4" :value="selectedId" @change="select">
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
                    <UiButton :disabled="full" @click="newDraft">
                        {{ tGame('game.automation.newScenario') }}
                    </UiButton>
                    <UiButton :disabled="!saved || full" @click="copySaved">
                        {{ tGame('game.automation.copyScenario') }}
                    </UiButton>
                    <UiButton variant="danger" :disabled="!saved || !available" @click="remove">
                        {{ tGame('game.automation.deleteScenario') }}
                    </UiButton>
                </div>
                <label>
                    {{ tGame('game.automation.scenarioName') }}
                    <UiInput
                        :border-width="4"
                        ref="scenarioName"
                        v-model="draft.name"
                        maxlength="80"
                    />
                </label>
                <div class="automation-row">
                    <UiButton
                        :aria-pressed="mode === 'builder'"
                        :highlighted="mode === 'builder'"
                        :disabled="textDirty"
                        @click="mode = 'builder'"
                    >
                        {{ tGame('game.automation.visualEditor') }}
                    </UiButton>
                    <UiButton
                        :aria-pressed="mode === 'text'"
                        :highlighted="mode === 'text'"
                        @click="editText"
                    >
                        {{ tGame('game.automation.pseudocode') }}
                    </UiButton>
                </div>
                <section v-if="mode === 'builder'" class="automation-form">
                    <h3>{{ tGame('game.automation.mainRoute') }}</h3>
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
                                <option value="count">
                                    {{ tGame('game.automation.severalTimes') }}
                                </option>
                                <option value="forever">
                                    {{ tGame('game.automation.indefinitely') }}
                                </option>
                            </UiSelect>
                        </label>
                        <UiNumberInput
                            v-if="draft.repeat !== null && draft.repeat !== 1"
                            v-model="draft.repeat"
                            :label="tGame('game.automation.numberLoops')"
                            :min="2"
                            :max="10000"
                        />
                    </div>
                    <p class="automation-muted">{{ editorHint }}</p>
                    <ScenarioStepsEditor
                        v-model="draft.main"
                        :label="tGame('game.automation.scenarioSteps')"
                        :markers="automation.markers"
                        :targets="targets"
                        :plots="plots"
                        :abilities="abilities"
                        :remaining-steps="remainingSteps"
                    />
                    <ScenarioRulesEditor
                        v-model:sequences="draft.sequences"
                        v-model:reactions="draft.reactions"
                        :main="draft.main"
                        :markers="automation.markers"
                        :targets="targets"
                        :plots="plots"
                        :abilities="abilities"
                        :remaining-steps="remainingSteps"
                    />
                </section>
                <ScenarioPseudocodeEditor
                    v-else
                    ref="textEditor"
                    v-model="text"
                    :error="textError"
                    :changed="textDirty"
                    @update:model-value="textError = ''"
                    @apply="applyText"
                    @revert="resetText"
                />
                <p v-if="textDirty" class="automation-muted">
                    {{ tGame('game.automation.pseudocodeApplyFirst') }}
                </p>
                <p v-if="saveError" role="alert" class="automation-error">{{ saveError }}</p>
                <div>
                    <UiButton variant="primary" :disabled="!canSave || !dirty" @click="save">
                        {{ tGame('game.automation.save') }}
                    </UiButton>
                </div>
            </template>
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
            <template v-if="section === 'own'">
                <p v-if="dirty" class="automation-muted">
                    {{ tGame('game.automation.saveYourChangesBeforeRunning') }}
                </p>
                <UiButton variant="primary" :disabled="!canStart" @click="start">
                    {{ tGame('game.automation.run') }}
                </UiButton>
            </template>
            <ScenarioRunStatus
                v-if="run"
                :run="run"
                :server-time="serverTime"
                :can-control="controls"
                @pause="control('scenario_pause')"
                @resume="control('scenario_resume')"
                @stop="control('scenario_stop')"
            />
        </div>
    </AutomationWindow>
</template>
