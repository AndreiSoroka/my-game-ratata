<script setup lang="ts">
import type { ConstellationId } from '@my-game-ratata/contracts'
import { computed, ref, watch } from 'vue'

import GameFrame from '../ui/primitives/GameFrame.vue'
import GameInput from '../ui/primitives/GameInput.vue'
import { describeConstellationBuild } from './constellationBuildSummary'
import { useConstellationDebugPanels } from './useConstellationDebugPanels'

const props = defineProps<{
    nodeId?: string
    path?: ConstellationId
    activeIds: ReadonlySet<string>
}>()
const panels = useConstellationDebugPanels()
const charged = ref(false)
const selectedId = computed(() => props.nodeId ?? `${props.path}.root`)
const canCharge = computed(
    () =>
        props.activeIds.has('magic.runic_echo') &&
        summary.value.available &&
        summary.value.effectType === 'active' &&
        summary.value.activationAbilityId === 'shot'
)
const summary = computed(() =>
    describeConstellationBuild(selectedId.value, props.activeIds, {
        runicCharged: charged.value,
        tileWidth: 16,
    })
)
watch(
    () => props.activeIds.has('magic.runic_echo'),
    (enabled) => {
        if (!enabled) charged.value = false
    }
)
</script>
<template>
    <details
        id="debug-build-result"
        v-if="summary.effectType"
        class="build-summary game-frame-host"
        data-testid="debug-build-summary"
        :data-result-node="selectedId"
        :data-result-type="summary.effectType"
        :aria-label="`${summary.name}: результат`"
        :open="panels.result"
        @toggle.self="panels.result = ($event.currentTarget as HTMLDetailsElement).open"
    >
        <summary @keydown.stop @keyup.stop>
            <GameFrame variant="panel" />{{ summary.name }}: результат
        </summary>
        <div class="build-content">
            <p v-if="!summary.available" data-testid="debug-build-inactive">
                {{
                    summary.effectType === 'passive'
                        ? 'Навык не включён в набор. Его эффект не применяется.'
                        : 'Заклинание не включено в набор.'
                }}
            </p>
            <label v-if="canCharge" class="runic-example"
                ><GameInput v-model="charged" type="checkbox" data-testid="debug-runic-charged" />
                Рунический заряд активен в примере</label
            >
            <dl>
                <div v-for="row in summary.rows" :key="row.label" :data-build-metric="row.label">
                    <dt>{{ row.label }}</dt>
                    <dd>{{ row.value }}</dd>
                </div>
            </dl>
            <ul v-if="summary.effects?.length">
                <li v-for="effect in summary.effects" :key="effect">{{ effect }}</li>
            </ul>
        </div>
    </details>
</template>
<style scoped>
.build-summary {
    border: 1px solid transparent;
    border-top: 0;
    font-size: 12px;
    line-height: 1.55;
}
summary {
    padding: 12px 16px;
    min-height: 44px;
    box-sizing: border-box;
    color: #d4e3df;
    font-size: 14px;
    cursor: pointer;
}
summary:focus-visible {
    outline: 2px solid #ffe0a1;
    outline-offset: -3px;
}
.build-content {
    display: grid;
    gap: 12px;
    padding: 0 16px 16px;
}
p,
dl,
dd,
ul {
    margin: 0;
}
dl {
    display: grid;
    gap: 8px;
}
dl > div {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
    padding-bottom: 7px;
    border-bottom: 1px solid #2b4653;
}
dt {
    color: #adc3cd;
    overflow-wrap: anywhere;
}
dd {
    text-align: right;
    color: #f4dc9b;
    max-width: 10em;
    overflow-wrap: anywhere;
}
ul {
    display: grid;
    gap: 6px;
    padding-left: 18px;
    color: #adc3cd;
}
.runic-example {
    display: flex;
    gap: 8px;
    align-items: center;
}
input {
    width: 20px;
    height: 20px;
    accent-color: #d7b96f;
}
</style>
