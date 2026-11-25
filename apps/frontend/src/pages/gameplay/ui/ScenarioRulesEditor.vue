<script setup lang="ts">
import {
    type MarkerDefinition,
    SCENARIO_MAX_STEPS,
    type ScenarioAbilityId,
    type ScenarioReaction,
    type ScenarioSequence,
    type ScenarioStep,
} from '@my-game-ratata/contracts'
import { nextTick, ref } from 'vue'

import type { ScenarioFarmPlot, ScenarioVisibleTarget } from '@/entities/scenarios'
import { editorId, moveScenarioEntry } from '@/entities/scenarios'
import { tGame } from '@/shared/lib/i18n'
import { UiButton, UiFrame, UiInput, UiNumberInput, UiSelect } from '@/shared/ui/common'

import ScenarioReactionTriggerFields from './ScenarioReactionTriggerFields.vue'
import ScenarioStepsEditor from './ScenarioStepsEditor.vue'

defineProps<{
    main: ScenarioStep[]
    markers: MarkerDefinition[]
    targets: ScenarioVisibleTarget[]
    plots: ScenarioFarmPlot[]
    abilities: ScenarioAbilityId[]
    remainingSteps: number
}>()
const sequences = defineModel<ScenarioSequence[]>('sequences', { required: true })
const reactions = defineModel<ScenarioReaction[]>('reactions', { required: true })
const sequenceList = ref<HTMLOListElement>()
const reactionList = ref<HTMLOListElement>()
async function addSequence(): Promise<void> {
    const id = editorId('sequence')
    let number = sequences.value.length + 1
    while (
        sequences.value.some(
            (sequence) => sequence.name === tGame('game.automation.newSequence', { number })
        )
    ) {
        number += 1
    }
    sequences.value = [
        ...sequences.value,
        { id, name: tGame('game.automation.newSequence', { number }), steps: [] },
    ]
    await nextTick()
    sequenceList.value?.lastElementChild?.querySelector('input')?.focus()
}
async function addReaction(): Promise<void> {
    const sequence = sequences.value[0]
    if (!sequence) return
    reactions.value = [
        ...reactions.value,
        {
            id: editorId('reaction'),
            trigger: { kind: 'enemy_visible', distanceTiles: 5 },
            sequenceId: sequence.id,
        },
    ]
    await nextTick()
    reactionList.value?.lastElementChild?.querySelector('select')?.focus()
}
function setDelay(reaction: ScenarioReaction, seconds: number): void {
    if (seconds > 0) reaction.delayMs = Math.round(seconds * 1000)
    else delete reaction.delayMs
}
function setNotification(reaction: ScenarioReaction, value: string): void {
    if (value) reaction.notification = value
    else delete reaction.notification
}
</script>

<template>
    <section class="automation-form">
        <h3>{{ tGame('game.automation.sequences') }}</h3>
        <ol
            v-if="sequences.length"
            ref="sequenceList"
            class="automation-list scenario-rule-list"
            :aria-label="tGame('game.automation.sequences')"
        >
            <li v-for="(sequence, index) in sequences" :key="sequence.id" class="automation-form">
                <div class="automation-row">
                    <label>
                        {{ tGame('game.automation.sequenceName') }}
                        <UiInput :border-width="4" v-model="sequence.name" maxlength="80" />
                    </label>
                    <UiButton
                        variant="danger"
                        :aria-label="
                            tGame('game.automation.deleteSequence', { name: sequence.name })
                        "
                        @click="sequences.splice(index, 1)"
                    >
                        {{ tGame('game.automation.delete') }}
                    </UiButton>
                </div>
                <ScenarioStepsEditor
                    v-model="sequence.steps"
                    :label="sequence.name"
                    :markers="markers"
                    :targets="targets"
                    :plots="plots"
                    :abilities="abilities"
                    :remaining-steps="remainingSteps"
                    allow-reaction-target
                />
            </li>
        </ol>
        <div>
            <UiButton :disabled="sequences.length >= SCENARIO_MAX_STEPS" @click="addSequence">
                {{ tGame('game.automation.addSequence') }}
            </UiButton>
        </div>
    </section>

    <section class="automation-form">
        <h3>{{ tGame('game.automation.reactions') }}</h3>
        <ol
            v-if="reactions.length"
            ref="reactionList"
            class="automation-list scenario-rule-list"
            :aria-label="tGame('game.automation.reactions')"
        >
            <li
                v-for="(reaction, index) in reactions"
                :key="reaction.id"
                class="automation-card game-frame-host"
            >
                <UiFrame variant="panel" />
                <div class="automation-row">
                    <h4>{{ tGame('game.automation.reaction', { number: index + 1 }) }}</h4>
                    <UiButton
                        :disabled="index === 0"
                        :aria-label="tGame('game.automation.moveReactionUp', { number: index + 1 })"
                        @click="reactions = moveScenarioEntry(reactions, index, -1)"
                    >
                        ↑
                    </UiButton>
                    <UiButton
                        :disabled="index === reactions.length - 1"
                        :aria-label="
                            tGame('game.automation.moveReactionDown', { number: index + 1 })
                        "
                        @click="reactions = moveScenarioEntry(reactions, index, 1)"
                    >
                        ↓
                    </UiButton>
                    <UiButton
                        variant="danger"
                        :aria-label="tGame('game.automation.deleteReaction', { number: index + 1 })"
                        @click="reactions.splice(index, 1)"
                    >
                        {{ tGame('game.automation.delete') }}
                    </UiButton>
                </div>
                <div class="automation-fields">
                    <ScenarioReactionTriggerFields
                        v-model="reaction.trigger"
                        :main="main"
                        :plots="plots"
                    />
                    <label>
                        {{ tGame('game.automation.reactionSequence') }}
                        <UiSelect :border-width="4" v-model="reaction.sequenceId">
                            <option
                                v-if="
                                    !sequences.some(
                                        (sequence) => sequence.id === reaction.sequenceId
                                    )
                                "
                                :value="reaction.sequenceId"
                                disabled
                            >
                                {{ tGame('game.automation.missingSequence') }}
                            </option>
                            <option
                                v-for="sequence in sequences"
                                :key="sequence.id"
                                :value="sequence.id"
                            >
                                {{ sequence.name }}
                            </option>
                        </UiSelect>
                    </label>
                    <UiNumberInput
                        :model-value="(reaction.delayMs ?? 0) / 1000"
                        :label="tGame('game.automation.reactionDelay')"
                        :min="0"
                        :max="3600"
                        :decimals="3"
                        @update:model-value="setDelay(reaction, $event)"
                    />
                    <label>
                        {{ tGame('game.automation.reactionNotification') }}
                        <UiInput
                            :border-width="4"
                            :model-value="reaction.notification ?? ''"
                            maxlength="160"
                            @update:model-value="setNotification(reaction, $event)"
                        />
                    </label>
                </div>
            </li>
        </ol>
        <p v-if="!sequences.length" class="automation-muted">
            {{ tGame('game.automation.needsSequence') }}
        </p>
        <div>
            <UiButton
                :disabled="!sequences.length || reactions.length >= SCENARIO_MAX_STEPS"
                @click="addReaction"
            >
                {{ tGame('game.automation.addReaction') }}
            </UiButton>
        </div>
    </section>
</template>

<style scoped>
.scenario-rule-list {
    margin: 0;
    padding: 0;
    list-style: none;
}
h3,
h4 {
    margin: 0;
}
</style>
