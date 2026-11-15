<script setup lang="ts">
import {
    ABILITY_DEFINITIONS,
    type DeityMood,
    type PrayerAbilityId,
    prayerAbilityIds,
} from '@my-game-ratata/contracts'
import { computed, reactive } from 'vue'

import ConstellationPrayerBuild from './ConstellationPrayerBuild.vue'
import { calculatePrayerScenario, prayerCalculatorSchool } from './constellationPrayerScenario'
import { useConstellationDebugPanels } from './useConstellationDebugPanels'

interface PrayerExampleContext {
    mood: DeityMood
    lowHealthEligible: boolean
    tileWidth: number
}
const props = defineProps<{ nodeId: string; enabledStarIds?: ReadonlySet<string> }>()
const panels = useConstellationDebugPanels()
const contexts = reactive(
    Object.fromEntries(
        prayerAbilityIds.map((id) => [
            id,
            {
                mood: 'neutral',
                lowHealthEligible: false,
                tileWidth: 16,
            },
        ])
    ) as Record<PrayerAbilityId, PrayerExampleContext>
)
const school = computed(() => prayerCalculatorSchool(props.nodeId))
const context = computed(() => (school.value ? contexts[school.value.id] : undefined))
const scenario = computed(() =>
    context.value
        ? calculatePrayerScenario(props.nodeId, context.value, props.enabledStarIds)
        : undefined
)
const available = computed(() => scenario.value?.build?.available ?? true)
const metrics = computed(() => {
    const current = scenario.value
    if (!current || !available.value) return []
    return current.metrics
})
const lastLight = computed(
    () => school.value?.id === 'pray' && props.enabledStarIds?.has('prayer.last_light')
)
const moods: { id: DeityMood; name: string }[] = [
    { id: 'benevolent', name: 'Благосклонность' },
    { id: 'neutral', name: 'Нейтральное' },
    { id: 'wrathful', name: 'Гнев' },
]
</script>
<template>
    <details
        id="debug-build-result"
        v-if="school && context && scenario"
        class="prayer-calculator"
        data-testid="debug-prayer-calculator"
        aria-label="Результат молитвы"
        :open="panels.result"
        @toggle.self="panels.result = ($event.currentTarget as HTMLDetailsElement).open"
    >
        <summary @keydown.stop @keyup.stop>
            {{ ABILITY_DEFINITIONS[school.id].name }}: результат
        </summary>
        <div class="prayer-content">
            <p class="prayer-school">
                <strong>{{ school.god }}</strong> · {{ school.masteryName }}
            </p>
            <div class="prayer-mood">
                <p>Настроение бога</p>
                <div
                    class="mood-buttons"
                    role="group"
                    aria-label="Настроение бога"
                    data-testid="debug-prayer-mood"
                    @keydown.stop
                    @keyup.stop
                >
                    <button
                        v-for="mood in moods"
                        :key="mood.id"
                        type="button"
                        :aria-pressed="context.mood === mood.id"
                        :data-mood="mood.id"
                        @click="context.mood = mood.id"
                    >
                        {{ mood.name }}
                    </button>
                </div>
            </div>
            <label v-if="lastLight" class="last-light-condition"
                ><input
                    v-model="context.lowHealthEligible"
                    type="checkbox"
                    data-testid="debug-last-light"
                />
                Условия «Последнего огонька» выполнены: мало HP после вражеского ранения</label
            >
            <dl
                v-if="available"
                class="prayer-metrics"
                data-testid="debug-prayer-metrics"
                aria-live="polite"
            >
                <div v-for="metric in metrics" :key="metric.label" :data-metric="metric.label">
                    <dt>{{ metric.label }}</dt>
                    <dd>{{ metric.value }}</dd>
                </div>
            </dl>
            <ConstellationPrayerBuild
                v-if="scenario.build"
                :result="scenario.build"
                :revival="nodeId.endsWith('.revive')"
            />
        </div>
    </details>
</template>
<style scoped>
.prayer-calculator {
    border: 1px solid #577888;
    background: #112c39;
}
summary {
    padding: 12px;
    min-height: 44px;
    box-sizing: border-box;
    color: #e8d6aa;
    font-size: 14px;
    cursor: pointer;
}
.prayer-content {
    display: grid;
    gap: 12px;
    padding: 0 12px 12px;
}
p,
dl,
dd {
    margin: 0;
}
.prayer-school {
    color: #b4ccd6;
}
.prayer-school strong {
    color: #d4e3df;
    font-weight: 500;
}
.prayer-mood {
    display: grid;
    gap: 5px;
    color: #b8cbd3;
    font-size: 12px;
}
label {
    display: grid;
    gap: 5px;
    min-width: 0;
    color: #b8cbd3;
    font-size: 12px;
}
.mood-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}
.mood-buttons button {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 44px;
    box-sizing: border-box;
    border: 1px solid #66818d;
    background: #0b202b;
    color: #eee6d2;
    padding: 8px;
    font: inherit;
}
.mood-buttons button[aria-pressed='true'] {
    border-color: #e5c171;
    background: #334743;
    color: #ffe0a1;
}
summary:focus-visible,
button:focus-visible {
    outline: 2px solid #ffe0a1;
    outline-offset: 2px;
}
.last-light-condition {
    display: flex;
    align-items: center;
    gap: 8px;
}
.last-light-condition input {
    width: 20px;
    height: 20px;
    accent-color: #d7b96f;
}
.prayer-metrics {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
}
.prayer-metrics > div {
    min-width: 0;
    padding: 8px;
    border: 1px solid #345565;
    background: #0b202b;
}
dt {
    color: #adc3cd;
    font-size: 11px;
}
dd {
    margin-top: 3px;
    color: #f4dc9b;
    font-size: 18px;
    font-variant-numeric: tabular-nums;
}
</style>
