<script setup lang="ts">
import type { SoulSnapshot } from '@my-game-ratata/contracts'
defineProps<{ soul: SoulSnapshot | undefined }>()
const sources = { human: 'Человек', model: 'Модель', script: 'Сценарий' }
</script>
<template>
    <span v-if="soul" class="soul-badge" :class="`soul-badge--${soul.kind}`">
        {{ soul.kind === 'spark' ? '✧ Искра' : '◌ Эхо' }}
        <span
            >{{ sources[soul.controlSource] }} ·
            {{ soul.canSpeak ? 'Есть речь' : 'Без речи' }}</span
        >
    </span>
</template>
<style scoped>
.soul-badge {
    display: inline-flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
    color: #d8c48e;
    font:
        11px/1.5 system-ui,
        sans-serif;
}
.soul-badge--echo {
    color: #abc1c8;
}
.soul-badge span {
    color: #a8b4a5;
}
</style>
