<script setup lang="ts">
import type { ConstellationNodeSnapshot } from '@my-game-ratata/contracts'

import type { BuildCascade, BuildFeedback } from './useConstellationBuild'

defineProps<{
    feedback?: BuildFeedback
    cascade?: BuildCascade
    nodes: ConstellationNodeSnapshot[]
}>()
const emit = defineEmits<{ inspect: [id: string]; dismiss: [] }>()
</script>
<template>
    <section
        v-if="feedback || cascade"
        class="build-feedback"
        aria-live="polite"
        aria-atomic="true"
        data-testid="debug-build-feedback"
    >
        <div
            v-if="feedback"
            :key="feedback.id"
            class="build-blocked"
            role="status"
            data-testid="debug-build-blocked"
        >
            <p>{{ feedback.text }}</p>
            <button
                v-for="id in feedback.missingParents"
                :key="id"
                type="button"
                :data-find-parent="id"
                @click="emit('inspect', id)"
            >
                Показать «{{ nodes.find((node) => node.id === id)?.name ?? id }}»
            </button>
        </div>
        <div v-if="cascade" :key="cascade.id" data-testid="debug-build-cascade">
            <div class="cascade-heading">
                <strong>Отключено звёзд: {{ cascade.ids.length }}</strong
                ><button
                    type="button"
                    aria-label="Скрыть список отключённых звёзд"
                    @click="emit('dismiss')"
                >
                    ×
                </button>
            </div>
            <ul v-if="cascade.ids.length <= 5">
                <li v-for="id in cascade.ids" :key="id">
                    {{ nodes.find((node) => node.id === id)?.name ?? id }}
                </li>
            </ul>
            <details v-else>
                <summary>Список отключённых звёзд</summary>
                <ul>
                    <li v-for="id in cascade.ids" :key="id">
                        {{ nodes.find((node) => node.id === id)?.name ?? id }}
                    </li>
                </ul>
            </details>
        </div>
    </section>
</template>
<style scoped>
.build-feedback {
    display: grid;
    gap: 12px;
    padding: 12px;
    border: 1px solid #b8945d;
    background: #302a1c;
    color: #f4dfae;
    font-size: 12px;
    line-height: 1.5;
}
p,
ul {
    margin: 0;
}
ul {
    margin-top: 8px;
    padding-left: 18px;
}
li + li {
    margin-top: 4px;
}
.build-blocked {
    display: grid;
    gap: 8px;
}
button {
    min-height: 44px;
    border: 1px solid #b8945d;
    background: #24251d;
    color: #f4dfae;
    padding: 8px 10px;
    text-align: left;
    font: inherit;
    cursor: pointer;
}
button:focus-visible,
summary:focus-visible {
    outline: 2px solid #ffe0a1;
    outline-offset: 2px;
}
.cascade-heading {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
}
.cascade-heading button {
    min-width: 44px;
    text-align: center;
}
summary {
    margin-top: 8px;
    cursor: pointer;
}
</style>
