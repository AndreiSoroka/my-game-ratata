<script setup lang="ts">
import { type DeityMood, type PrayerAbilityId, prayerAbilityIds } from '@my-game-ratata/contracts'
import { computed, reactive } from 'vue'

import { fullConstellationCatalog } from '../../../../backend/src/game/constellationNodes'
import GameButton from '../ui/primitives/GameButton.vue'
import GameFrame from '../ui/primitives/GameFrame.vue'
import GameInput from '../ui/primitives/GameInput.vue'
import ConstellationPrayerBuild from './ConstellationPrayerBuild.vue'
import { calculatePrayerScenario, prayerCalculatorSchool } from './constellationPrayerScenario'
import { useConstellationDebugPanels } from './useConstellationDebugPanels'

interface PrayerExampleContext {
    mood: DeityMood
    lowHealthEligible: boolean
    tileWidth: number
    aurasSuppressed: boolean
    externalAdvantage: boolean
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
                aurasSuppressed: false,
                externalAdvantage: false,
            },
        ])
    ) as Record<PrayerAbilityId, PrayerExampleContext>
)
const school = computed(() => prayerCalculatorSchool(props.nodeId))
const node = computed(() => fullConstellationCatalog.find((entry) => entry.id === props.nodeId))
const passive = computed(() => node.value?.effectType === 'passive')
const showMood = computed(
    () =>
        !passive.value ||
        props.nodeId === 'prayer.harm' ||
        props.nodeId.endsWith('.revive') ||
        props.nodeId === 'prayer.concentration'
)
const context = computed(() => (school.value ? contexts[school.value.id] : undefined))
const scenario = computed(() =>
    context.value
        ? calculatePrayerScenario(props.nodeId, context.value, props.enabledStarIds)
        : undefined
)
const available = computed(() => passive.value || (scenario.value?.build?.available ?? true))
const metrics = computed(() => {
    const current = scenario.value
    if (!current || !available.value) return []
    return current.metrics
})
const lastLight = computed(
    () =>
        props.nodeId === 'prayer.last_light' ||
        (!passive.value &&
            school.value?.id === 'pray' &&
            props.enabledStarIds?.has('prayer.last_light'))
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
        class="prayer-calculator game-frame-host"
        data-testid="debug-prayer-calculator"
        :data-result-node="nodeId"
        :data-result-type="node?.effectType"
        :aria-label="`${node?.name}: результат`"
        :open="panels.result"
        @toggle.self="panels.result = ($event.currentTarget as HTMLDetailsElement).open"
    >
        <summary @keydown.stop @keyup.stop>
            <GameFrame variant="panel" />{{ node?.name }}: результат
        </summary>
        <div class="prayer-content">
            <p class="prayer-school">
                <strong>{{ school.god }}</strong> · {{ school.masteryName }}
            </p>
            <div v-if="showMood" class="prayer-mood">
                <p>Настроение бога</p>
                <div
                    class="mood-buttons"
                    role="group"
                    aria-label="Настроение бога"
                    data-testid="debug-prayer-mood"
                    @keydown.stop
                    @keyup.stop
                >
                    <GameButton
                        size="compact"
                        v-for="mood in moods"
                        :key="mood.id"
                        :aria-pressed="context.mood === mood.id"
                        :data-mood="mood.id"
                        @click="context.mood = mood.id"
                    >
                        {{ mood.name }}
                    </GameButton>
                </div>
            </div>
            <label v-if="lastLight" class="last-light-condition"
                ><GameInput
                    v-model="context.lowHealthEligible"
                    type="checkbox"
                    data-testid="debug-last-light"
                />
                Условия «Последнего огонька» выполнены: мало HP после вражеского ранения</label
            >
            <label v-if="school.id === 'pray'" class="last-light-condition"
                ><GameInput
                    v-model="context.aurasSuppressed"
                    type="checkbox"
                    data-testid="debug-auras-suppressed"
                />Ауры подавлены</label
            >
            <label class="last-light-condition"
                ><GameInput
                    v-model="context.externalAdvantage"
                    type="checkbox"
                    data-testid="debug-external-advantage"
                />Преимущество от другого участника группы</label
            >
            <dl
                v-if="available && metrics.length"
                class="prayer-metrics"
                data-testid="debug-prayer-metrics"
                aria-live="polite"
            >
                <div
                    v-for="metric in metrics"
                    :key="metric.label"
                    :data-metric="metric.label"
                    class="prayer-metric game-frame-host"
                >
                    <GameFrame variant="inset" />
                    <dt>{{ metric.label }}</dt>
                    <dd>{{ metric.value }}</dd>
                </div>
            </dl>
            <ConstellationPrayerBuild
                v-if="scenario.build"
                :result="scenario.build"
                :passive="passive"
            />
        </div>
    </details>
</template>
<style scoped>
.prayer-calculator {
    border: 1px solid transparent;
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
    border: 1px solid transparent;
    padding: 8px;
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
.prayer-metric {
    min-width: 0;
    padding: 8px;
    border: 1px solid transparent;
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
