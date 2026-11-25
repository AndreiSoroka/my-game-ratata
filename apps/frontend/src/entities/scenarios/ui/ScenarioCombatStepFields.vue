<script setup lang="ts">
import {
    type ScenarioAbilityId,
    scenarioAbilityTargets,
    type ScenarioStep,
} from '@my-game-ratata/contracts'
import { computed } from 'vue'

import { abilityName, tGame } from '@/shared/lib/i18n'
import { UiSelect } from '@/shared/ui/common'

type CombatStep = Extract<ScenarioStep, { kind: 'attack' | 'cast' | 'follow' }>
type Target = NonNullable<CombatStep['target']>
const props = defineProps<{ abilities: ScenarioAbilityId[]; allowReactionTarget?: boolean }>()
const step = defineModel<CombatStep>({ required: true })
const targets = computed(() => {
    const entry = step.value
    let choices: readonly Target[]
    if (entry.kind === 'cast') choices = scenarioAbilityTargets(entry.abilityId)
    else if (entry.kind === 'follow') choices = ['nearest_friendly', 'reaction_target']
    else choices = ['visible_enemy', 'reaction_target']
    return choices.filter((target) => target !== 'reaction_target' || props.allowReactionTarget)
})
const targetLabels = {
    get self() {
        return tGame('game.automation.selfTarget')
    },
    get visible_enemy() {
        return tGame('game.automation.visibleEnemyTarget')
    },
    get reaction_target() {
        return tGame('game.automation.reactionTarget')
    },
    get nearest_friendly() {
        return tGame('game.automation.nearestFriendly')
    },
}
function ability(event: Event): void {
    const selected = (event.target as HTMLSelectElement).value
    const abilityId = props.abilities.find((id) => id === selected)
    if (!abilityId) return
    const target = scenarioAbilityTargets(abilityId)[0]
    if (target && step.value.kind === 'cast') step.value = { ...step.value, abilityId, target }
}
function target(event: Event): void {
    const selected = (event.target as HTMLSelectElement).value
    const choice = targets.value.find((target) => target === selected)
    if (choice) step.value = { ...step.value, target: choice } as CombatStep
}
</script>

<template>
    <label v-if="step.kind === 'cast'">
        {{ tGame('game.automation.ability') }}
        <UiSelect :border-width="4" :value="step.abilityId" @change="ability">
            <option v-if="!abilities.includes(step.abilityId)" :value="step.abilityId" disabled>
                {{ abilityName(step.abilityId) }}
            </option>
            <option v-for="id in abilities" :key="id" :value="id">
                {{ abilityName(id) }}
            </option>
        </UiSelect>
    </label>
    <label v-if="step.kind !== 'attack' || allowReactionTarget">
        {{ tGame('game.automation.targetSelection') }}
        <UiSelect :border-width="4" :value="step.target ?? 'visible_enemy'" @change="target">
            <option v-for="id in targets" :key="id" :value="id">
                {{ targetLabels[id] }}
            </option>
        </UiSelect>
    </label>
    <p v-if="step.kind === 'attack'" class="automation-muted">
        {{ tGame('game.automation.attacksValidVisibleEnemyUsing') }}
    </p>
</template>
