<script setup lang="ts">
import { type DeityMood, type PrayerAbilityId, prayerAbilityIds } from '@my-game-ratata/contracts'
import { computed, reactive } from 'vue'

import ConstellationPrayerBuild from './ConstellationPrayerBuild.vue'
import { calculatePrayerScenario, prayerCalculatorSchool } from './constellationPrayerScenario'

interface PrayerExampleContext {
    faithLevel: number
    mood: DeityMood
    miraclesLevel: number
    lowHealthEligible: boolean
    tileWidth: number
}
const props = defineProps<{ nodeId: string; enabledStarIds?: ReadonlySet<string> }>()
const contexts = reactive(
    Object.fromEntries(
        prayerAbilityIds.map((id) => [
            id,
            {
                faithLevel: 1,
                mood: 'neutral',
                miraclesLevel: 1,
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
    return current.build
        ? current.metrics.filter((metric) =>
              ['Шанс ответа', 'Отказ божества'].includes(metric.label)
          )
        : current.metrics
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
    <section
        id="debug-build-result"
        v-if="school && context && scenario"
        class="prayer-calculator"
        data-testid="debug-prayer-calculator"
        aria-label="Параметры примера"
    >
        <h3>Параметры примера</h3>
        <p class="prayer-school">
            <strong>{{ school.god }}</strong> · {{ school.faithName }}
        </p>
        <p class="prayer-example-scale">Размер клетки в примере: {{ context.tileWidth }} px</p>
        <div class="prayer-inputs">
            <label
                >Уровень Веры
                <select v-model.number="context.faithLevel" data-testid="debug-prayer-faith">
                    <option v-for="level in 10" :key="level" :value="level">{{ level }}</option>
                </select>
            </label>
            <label
                >Уровень Чудес
                <select v-model.number="context.miraclesLevel" data-testid="debug-prayer-miracles">
                    <option v-for="level in 10" :key="level" :value="level">{{ level }}</option>
                </select>
            </label>
            <label class="prayer-mood"
                >Настроение бога
                <select v-model="context.mood" data-testid="debug-prayer-mood">
                    <option v-for="mood in moods" :key="mood.id" :value="mood.id">
                        {{ mood.name }}
                    </option>
                </select>
            </label>
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
        <p v-if="available" class="prayer-substitution">
            <span>Подстановка значений</span
            ><code data-testid="debug-prayer-substitution">{{ scenario.substitution }}</code>
        </p>
    </section>
</template>
<style scoped>
.prayer-calculator {
    display: grid;
    gap: 12px;
    padding: 12px;
    border: 1px solid #577888;
    background: #112c39;
}
h3,
p,
dl,
dd {
    margin: 0;
}
h3 {
    color: #e8d6aa;
    font-size: 14px;
}
.prayer-school {
    color: #b4ccd6;
}
.prayer-school strong {
    color: #d4e3df;
    font-weight: 500;
}
.prayer-inputs {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
}
label {
    display: grid;
    gap: 5px;
    min-width: 0;
    color: #b8cbd3;
    font-size: 12px;
}
select {
    width: 100%;
    min-width: 0;
    min-height: 44px;
    box-sizing: border-box;
    border: 1px solid #66818d;
    background: #0b202b;
    color: #eee6d2;
    padding: 8px;
    font: inherit;
}
select:focus-visible {
    outline: 2px solid #ffe0a1;
    outline-offset: 2px;
}
.prayer-mood {
    grid-column: 1/-1;
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
.prayer-substitution {
    display: grid;
    gap: 6px;
    color: #adc3cd;
}
code {
    display: block;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    color: #eee6d2;
    font:
        13px/1.6 ui-monospace,
        monospace;
}
@media (max-width: 420px) {
    .prayer-inputs {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
