<script setup lang="ts">
import type { SoulSnapshot } from '@my-game-ratata/contracts'
defineProps<{ soul: SoulSnapshot | undefined; compact?: boolean }>()
const sources = { human: 'Человек', model: 'Модель', script: 'Сценарий' }
</script>
<template>
    <span
        v-if="soul"
        class="soul-badge"
        :class="[`soul-badge--${soul.kind}`, { 'soul-badge--compact': compact }]"
    >
        <template v-if="compact">
            <span
                class="soul-badge__icon"
                role="img"
                :aria-label="soul.kind === 'spark' ? 'Искра' : 'Эхо'"
                :title="soul.kind === 'spark' ? 'Искра' : 'Эхо'"
                >{{ soul.kind === 'spark' ? '✧' : '◌' }}</span
            >
            <span
                class="soul-badge__icon"
                role="img"
                :aria-label="soul.canSpeak ? 'Есть речь' : 'Без речи'"
                :title="soul.canSpeak ? 'Есть речь' : 'Без речи'"
            >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M21 4H3v13h5v4l5-4h8z" />
                    <path v-if="soul.canSpeak" d="M7 9h10M7 12h7" />
                    <path v-else d="m3 2 19 20" />
                </svg>
            </span>
        </template>
        <template v-else>
            {{ soul.kind === 'spark' ? '✧ Искра' : '◌ Эхо' }}
            <span
                >{{ sources[soul.controlSource] }} ·
                {{ soul.canSpeak ? 'Есть речь' : 'Без речи' }}</span
            >
        </template>
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
.soul-badge--compact {
    flex-wrap: nowrap;
    gap: 8px;
}
.soul-badge__icon {
    display: inline-grid;
    width: 16px;
    height: 16px;
    place-items: center;
    font: 16px/1 system-ui;
}
.soul-badge__icon svg {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
}
</style>
