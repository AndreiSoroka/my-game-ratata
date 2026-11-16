<script setup lang="ts">
import type { ConstellationNodeSnapshot } from '@my-game-ratata/contracts'

defineProps<{ node: ConstellationNodeSnapshot }>()
</script>

<template>
    <aside class="constellation-detail" aria-label="Выбранная звезда" aria-live="polite">
        <template v-if="node.unlocked && node.name">
            <h3>{{ node.name }}</h3>
            <span v-if="node.effectType" class="constellation-detail__type">{{
                node.effectType === 'active' ? 'Активное заклинание' : 'Пассивный навык'
            }}</span>
            <p v-if="node.description">{{ node.description }}</p>
            <ul v-if="node.effects?.length">
                <li v-for="effect in node.effects" :key="effect">{{ effect }}</li>
            </ul>
        </template>
        <h3 v-else>Неизвестно</h3>
    </aside>
</template>

<style scoped>
.constellation-detail {
    display: grid;
    gap: 12px;
    min-width: 0;
    padding: 18px;
    border: 1px solid #4f6470;
    background: #122631;
    color: #eee6d2;
    font:
        14px/1.5 system-ui,
        sans-serif;
}
h3,
p,
ul {
    margin: 0;
}
h3 {
    font-size: 20px;
    color: #f0d89c;
}
.constellation-detail__type {
    color: #b6d7be;
    font-size: 11px;
}
p,
li {
    font-size: 12px;
    line-height: 1.65;
}
ul {
    display: grid;
    gap: 4px;
    padding-left: 18px;
}
@media (max-width: 780px) {
    .constellation-detail {
        padding: 14px;
    }
}
</style>
