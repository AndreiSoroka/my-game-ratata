<script setup lang="ts">
import { type HeroClass, MASTERY_NAMES } from '@my-game-ratata/contracts'
import { computed } from 'vue'

import { describeConstellationUnlock } from './constellationDebugUnlock'
import { constellationStarPlan } from './constellationMasteryPlan'

const props = defineProps<{
    nodeId: string
    activeIds?: ReadonlySet<string>
    heroClass?: HeroClass
}>()
const details = computed(() => describeConstellationUnlock(props.nodeId, props.heroClass))
const minimum = computed(() =>
    Object.entries(constellationStarPlan(props.nodeId, props.heroClass).levels)
        .filter(([, level]) => level > 0)
        .map(([id, level]) => `${MASTERY_NAMES[id as keyof typeof MASTERY_NAMES]} ${level}`)
        .join(' · ')
)
</script>
<template>
    <div class="debug-unlock-wrap">
        <p class="debug-minimum" data-testid="debug-star-minimum">
            {{
                minimum
                    ? `Минимум для звезды: ${minimum}`
                    : 'Бесплатная звезда: по старту класса или условию изучения'
            }}
        </p>
        <details
            class="debug-unlock"
            data-testid="debug-unlock-conditions"
            aria-label="Условия открытия"
        >
            <summary>Условия открытия</summary>
            <ul v-if="details.conditions.length">
                <li v-for="condition in details.conditions" :key="condition">{{ condition }}</li>
            </ul>
            <p v-else>Особых условий нет.</p>
            <section
                v-if="details.chanceBoosts.length"
                data-testid="debug-chance-actions"
                aria-label="Повышают шанс открытия"
            >
                <h3>Повышают шанс открытия</h3>
                <ul>
                    <li v-for="hint in details.chanceBoosts" :key="hint">{{ hint }}</li>
                </ul>
            </section>
        </details>
    </div>
</template>
<style scoped>
.debug-unlock {
    padding: 16px;
    border: 1px solid #425f6d;
    border-top: 0;
    background: #10232d;
    font-size: 12px;
    line-height: 1.55;
}
summary,
h3,
p,
ul {
    margin: 0;
}
h2,
h3 {
    color: #d4e3df;
    font-size: 13px;
}
ul {
    display: grid;
    gap: 4px;
    padding-left: 18px;
}
summary + ul,
h3 + ul,
summary + p {
    margin-top: 8px;
}
section > section {
    margin-top: 16px;
}
.debug-minimum {
    padding: 10px 14px;
    border: 1px solid #425f6d;
    border-top: 0;
    background: #10232d;
    color: #e8d6aa;
    font-size: 12px;
}
summary {
    cursor: pointer;
}
summary:focus-visible {
    outline: 2px solid #ffe0a1;
    outline-offset: 3px;
}
</style>
