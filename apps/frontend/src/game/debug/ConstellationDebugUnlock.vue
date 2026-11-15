<script setup lang="ts">
import { computed } from 'vue'

import { describeConstellationUnlock } from './constellationDebugUnlock'

const props = defineProps<{ nodeId: string }>()
const details = computed(() => describeConstellationUnlock(props.nodeId))
</script>
<template>
    <section
        class="debug-unlock"
        data-testid="debug-unlock-conditions"
        aria-label="Условия открытия"
    >
        <h2>Условия открытия</h2>
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
    </section>
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
    gap: 4px;
    padding-left: 18px;
}
h2 + ul,
h3 + ul,
h2 + p {
    margin-top: 8px;
}
section > section {
    margin-top: 16px;
}
</style>
