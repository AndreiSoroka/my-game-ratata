<script setup lang="ts">
import {
    backgroundMasteryMultiplier,
    backgroundMasteryRewardMicros,
    type ConstellationId,
    formatMasteryExperience,
    type HeroClass,
    MASTERY_NAMES,
    masteryConflict,
    masteryRewardsForConstellation,
    masteryThreshold,
    masteryTotalExperience,
} from '@my-game-ratata/contracts'
import { computed, ref } from 'vue'

import { displayMasteryExperience } from '../ui/masteryPresentation'
import GameFrame from '../ui/primitives/GameFrame.vue'
import GameSelect from '../ui/primitives/GameSelect.vue'
import { constellationBuildLevels, paidConstellationStars } from './constellationMasteryPlan'
import { useConstellationDebugPanels } from './useConstellationDebugPanels'

const props = defineProps<{
    path: ConstellationId
    activeIds: ReadonlySet<string>
    heroClass: HeroClass
}>()
const panels = useConstellationDebugPanels()
const selectedRewards = ref<Record<string, string>>({})
const levels = computed(() => constellationBuildLevels(props.activeIds, props.heroClass))
const level = computed(() => levels.value[props.path])
const rewardNodes: Partial<Record<string, string>> = {
    prayerHarm: 'prayer.harm',
    fireballHit: 'magic.fireball',
    greaterFireballHit: 'magic.greater_fireball',
}
const rewards = computed(() =>
    masteryRewardsForConstellation(props.path).filter((entry) => {
        const required =
            entry.id === 'resurrection' ? `${props.path}.revive` : rewardNodes[entry.id]
        return required === undefined || props.activeIds.has(required)
    })
)
const reward = computed(
    () =>
        rewards.value.find((entry) => entry.id === selectedRewards.value[props.path]) ??
        rewards.value[0]!
)
const conflict = computed(() => masteryConflict(levels.value, props.path))
const backgroundMultiplier = computed(() =>
    backgroundMasteryMultiplier(props.heroClass, props.path)
)
const rate = computed(() =>
    backgroundMasteryRewardMicros(
        reward.value.experience,
        conflict.value,
        props.heroClass,
        props.path
    )
)
const threshold = computed(() => masteryThreshold(level.value))
const repetitions = computed(() => (threshold.value + rate.value - 1n) / rate.value)
const pending = computed(
    () => level.value - paidConstellationStars(props.activeIds, props.path, props.heroClass)
)
const xp = (value: bigint) => displayMasteryExperience(formatMasteryExperience(value))
const percent = (value: number) =>
    new Intl.NumberFormat('ru-RU', { style: 'percent', maximumFractionDigits: 2 }).format(value)
</script>
<template>
    <details
        class="mastery-summary game-frame-host"
        data-testid="debug-mastery-summary"
        aria-label="Развитие выбранного созвездия"
        :open="panels.mastery"
        @toggle.self="panels.mastery = ($event.currentTarget as HTMLDetailsElement).open"
    >
        <summary @keydown.stop @keyup.stop><GameFrame variant="panel" />Развитие созвездия</summary>
        <div class="mastery-content">
            <h2>
                {{ MASTERY_NAMES[path] }} · нужен уровень
                <strong data-testid="debug-mastery-level">{{ level }}</strong>
            </h2>
            <p>
                Для набора:
                <strong data-testid="debug-mastery-total"
                    >{{ xp(masteryTotalExperience(level)) }} XP</strong
                >
                от начала.
            </p>
            <p v-if="pending" data-testid="debug-mastery-pending">
                Не распределено открытий в плане: {{ pending }}. Дополнительные случайные звёзды не
                выбраны.
            </p>
            <label
                >Действие для расчёта
                <GameSelect
                    :value="reward.id"
                    data-testid="debug-mastery-reward"
                    @change="selectedRewards[path] = ($event.target as HTMLSelectElement).value"
                >
                    <option v-for="entry in rewards" :key="entry.id" :value="entry.id">
                        {{ entry.label }} · {{ entry.experience }} XP
                    </option>
                </GameSelect>
            </label>
            <dl>
                <div>
                    <dt>
                        База {{ reward.experience }} XP · прошлое +{{
                            Math.round((backgroundMultiplier - 1) * 100)
                        }}% · конфликт
                        {{ conflict < 1 ? `−${percent(1 - conflict)}` : '0%' }}
                    </dt>
                    <dd data-testid="debug-mastery-rate">{{ xp(rate) }} XP</dd>
                </div>
                <div>
                    <dt>До следующего уровня (прогресс 0)</dt>
                    <dd data-testid="debug-mastery-next">
                        {{ repetitions.toString() }} действий · 0 / {{ xp(threshold) }} XP
                    </dd>
                </div>
            </dl>
            <p class="mastery-note">
                Расчёт следующего уровня сохраняет остальные созвездия и предполагает доступное
                действие.
            </p>
        </div>
    </details>
</template>
<style scoped>
.mastery-summary {
    border: 1px solid transparent;
    border-top: 0;
    font-size: 12px;
    line-height: 1.5;
}
summary {
    padding: 12px 14px;
    min-height: 44px;
    box-sizing: border-box;
    color: #e8d6aa;
    font-size: 14px;
    cursor: pointer;
}
summary:focus-visible {
    outline: 2px solid #ffe0a1;
    outline-offset: -3px;
}
.mastery-content {
    display: grid;
    gap: 10px;
    padding: 0 14px 14px;
}
h2,
p,
dl,
dd {
    margin: 0;
}
h2 {
    font-size: 14px;
    color: #e8d6aa;
}
strong,
dd {
    color: #f4dc9b;
}
label {
    display: grid;
    gap: 5px;
    color: #b8cbd3;
}
select {
    width: 100%;
    min-width: 0;
    min-height: 44px;
    padding: 8px;
    border: 1px solid transparent;
}
dl {
    display: grid;
    gap: 8px;
}
dl > div {
    display: flex;
    justify-content: space-between;
    gap: 12px;
}
dd {
    text-align: right;
    max-width: 12em;
}
.mastery-note {
    color: #adc3cd;
    font-size: 11px;
}
</style>
