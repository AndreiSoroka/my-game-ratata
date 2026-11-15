<script setup lang="ts">
import type { ConstellationId } from '@my-game-ratata/contracts'
import { computed, ref, watch } from 'vue'

import { describeConstellationBuild } from './constellationBuildSummary'

const props = defineProps<{ path: ConstellationId; activeIds: ReadonlySet<string> }>()
const charged = ref(false)
const visible = computed(() => !props.path.startsWith('prayer'))
const canCharge = computed(
    () =>
        props.activeIds.has('magic.runic_echo') &&
        (props.path === 'magic' || props.path === 'arrow')
)
const summary = computed(() =>
    describeConstellationBuild(props.path, props.activeIds, {
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
    <section
        id="debug-build-result"
        v-if="visible"
        class="build-summary"
        data-testid="debug-build-summary"
        aria-label="Итог созвездия"
    >
        <h2>Итог созвездия</h2>
        <p>Размер клетки в примере: 16 px</p>
        <p v-if="!activeIds.has(`${path}.root`)">Корень созвездия не включён в набор.</p>
        <label v-if="canCharge" class="runic-example"
            ><input v-model="charged" type="checkbox" data-testid="debug-runic-charged" />
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
    </section>
</template>
<style scoped>
.build-summary {
    display: grid;
    gap: 12px;
    padding: 16px;
    border: 1px solid #425f6d;
    border-top: 0;
    background: #10232d;
    font-size: 12px;
    line-height: 1.55;
}
h2,
p,
dl,
dd,
ul {
    margin: 0;
}
h2 {
    color: #d4e3df;
    font-size: 14px;
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
