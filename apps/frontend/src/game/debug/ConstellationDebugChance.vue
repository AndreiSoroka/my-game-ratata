<script setup lang="ts">
import { computed } from 'vue'

import { describeConstellationEffectChance } from './constellationEffectChance'

const props = defineProps<{ nodeId: string }>()
const chance = computed(() => describeConstellationEffectChance(props.nodeId))
const longNotes = computed(
    () => chance.value.notes.length > 2 || chance.value.notes.join(' ').length > 240
)
</script>
<template>
    <section
        class="debug-effect-chance"
        data-testid="debug-effect-chance"
        aria-label="Шанс срабатывания эффекта"
    >
        <h2>Шанс срабатывания эффекта</h2>
        <p data-testid="debug-effect-chance-summary">{{ chance.summary }}</p>
        <ul
            v-if="chance.formulas.length"
            class="chance-formulas"
            data-testid="debug-effect-chance-formulas"
            aria-label="Формулы шанса"
        >
            <li v-for="formula in chance.formulas" :key="formula">
                <code>{{ formula }}</code>
            </li>
        </ul>
        <section v-if="chance.examples.length" class="chance-examples">
            <h3>Примеры расчёта</h3>
            <table aria-label="Примеры расчёта">
                <tbody>
                    <tr v-for="example in chance.examples" :key="example.label">
                        <th scope="row">{{ example.label }}</th>
                        <td>{{ example.value }}</td>
                    </tr>
                </tbody>
            </table>
        </section>
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
    </section>
</template>
<style scoped>
.debug-effect-chance {
    display: grid;
    gap: 12px;
    padding: 16px;
    border: 1px solid #425f6d;
    border-top: 0;
    background: #10232d;
    color: #eee6d2;
    font:
        12px/1.55 system-ui,
        sans-serif;
}
h2,
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
.chance-formulas {
    padding: 0;
    list-style: none;
}
.chance-formulas li {
    padding: 8px;
    border: 1px solid #34505e;
    background: #0a1c27;
}
code {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font:
        11px/1.65 ui-monospace,
        monospace;
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
details[open] ul {
    margin-top: 8px;
}
</style>
