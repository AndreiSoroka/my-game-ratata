<script setup lang="ts">
import { computed } from 'vue'

import ConstellationChanceFormulas from './ConstellationChanceFormulas.vue'
import { describeConstellationEffectChance } from './constellationEffectChance'
import ConstellationPrayerCalculator from './ConstellationPrayerCalculator.vue'

const props = defineProps<{ nodeId: string; enabledStarIds?: ReadonlySet<string> }>()
const chance = computed(() => describeConstellationEffectChance(props.nodeId))
const longNotes = computed(
    () => chance.value.notes.length > 2 || chance.value.notes.join(' ').length > 240
)
</script>
<template>
    <div>
        <ConstellationPrayerCalculator :node-id="nodeId" :enabled-star-ids="enabledStarIds" />
        <details
            v-if="!chance.deterministic && chance.formulas.length"
            class="debug-effect-chance"
            data-testid="debug-effect-chance"
            aria-label="Шанс срабатывания эффекта"
        >
            <summary @keydown.stop @keyup.stop>Шанс срабатывания эффекта</summary>
            <p data-testid="debug-effect-chance-summary">{{ chance.summary }}</p>
            <ConstellationChanceFormulas
                :details="chance.formulaDetails"
                :legacy="chance.formulas"
            />
            <details v-if="chance.examples.length" class="chance-examples">
                <summary>Готовые примеры расчёта</summary>
                <table aria-label="Примеры расчёта">
                    <tbody>
                        <tr v-for="example in chance.examples" :key="example.label">
                            <th scope="row">{{ example.label }}</th>
                            <td>{{ example.value }}</td>
                        </tr>
                    </tbody>
                </table>
            </details>
            <details v-if="longNotes" class="chance-notes">
                <summary>Примечания</summary>
                <ul>
                    <li v-for="note in chance.notes" :key="note">{{ note }}</li>
                </ul>
            </details>
            <section v-else-if="chance.notes.length" class="chance-notes">
                <h3>Примечания</h3>
                <ul>
                    <li v-for="note in chance.notes" :key="note">{{ note }}</li>
                </ul>
            </section>
        </details>
    </div>
</template>
<style scoped>
.debug-effect-chance {
    display: block;
    padding: 16px;
    border: 1px solid #425f6d;
    border-top: 0;
    background: #10232d;
    color: #eee6d2;
    font:
        12px/1.55 system-ui,
        sans-serif;
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
    gap: 6px;
    padding-left: 18px;
}
.chance-examples,
.chance-notes {
    display: grid;
    gap: 8px;
}
table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
    font-size: 11px;
}
th,
td {
    padding: 7px 5px;
    border-top: 1px solid #34505e;
    text-align: left;
    vertical-align: top;
    overflow-wrap: anywhere;
}
th {
    width: 60%;
    font-weight: 400;
    color: #adc3cd;
}
td {
    color: #eee6d2;
    font-variant-numeric: tabular-nums;
}
summary {
    cursor: pointer;
    color: #cce2e7;
}
summary:focus-visible {
    outline: 2px solid #ffe0a1;
    outline-offset: 3px;
}
details[open] > p,
details[open] > ul,
details[open] > details,
details[open] > section {
    margin-top: 12px;
}
details[open] ul {
    margin-top: 8px;
}
</style>
