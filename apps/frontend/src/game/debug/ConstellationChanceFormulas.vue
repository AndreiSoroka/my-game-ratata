<script setup lang="ts">
import { computed } from 'vue'

import GameFrame from '../ui/primitives/GameFrame.vue'
import type { ConstellationChanceFormula } from './constellationChanceTypes'

const props = defineProps<{ details?: ConstellationChanceFormula[]; legacy: string[] }>()
const formulas = computed(() =>
    props.details?.length
        ? props.details
        : props.legacy.map((expression) => ({ label: 'Формула', expression, variables: [] }))
)
</script>
<template>
    <ul
        v-if="formulas.length"
        class="chance-formulas"
        data-testid="debug-effect-chance-formulas"
        aria-label="Формулы шанса"
    >
        <li
            v-for="(formula, index) in formulas"
            :key="index"
            class="formula-card game-frame-host"
            data-testid="debug-effect-formula"
        >
            <GameFrame variant="inset" />
            <h3>{{ formula.label }}</h3>
            <code>{{ formula.expression }}</code>
            <dl
                v-if="formula.variables.length"
                class="formula-legend"
                data-testid="debug-formula-legend"
            >
                <div v-for="variable in formula.variables" :key="variable.symbol">
                    <dt>{{ variable.symbol }}</dt>
                    <dd>{{ variable.description }}</dd>
                </div>
            </dl>
            <p v-else class="formula-constant">В выражении нет переменных.</p>
        </li>
    </ul>
</template>
<style scoped>
.chance-formulas {
    display: grid;
    gap: 12px;
    margin: 0;
    padding: 0;
    list-style: none;
}
.formula-card {
    display: grid;
    gap: 10px;
    min-width: 0;
    padding: 12px;
    border: 1px solid transparent;
}
h3,
p,
dl,
dd {
    margin: 0;
}
h3 {
    color: #d4e3df;
    font-size: 13px;
    font-weight: 500;
}
code {
    display: block;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font:
        14px/1.65 ui-monospace,
        monospace;
    color: #f5e4bb;
}
.formula-legend {
    display: grid;
    gap: 7px;
}
.formula-legend > div {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 8px;
    align-items: baseline;
}
dt {
    max-width: 6em;
    overflow-wrap: anywhere;
    font:
        600 12px/1.5 ui-monospace,
        monospace;
    color: #dce9e7;
}
dd,
.formula-constant {
    color: #adc3cd;
    overflow-wrap: anywhere;
    font-size: 12px;
    line-height: 1.5;
}
</style>
