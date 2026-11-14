<script setup lang="ts">
import type { SoulSnapshot } from '@my-game-ratata/contracts'
defineProps<{ soul: SoulSnapshot | undefined; compact?: boolean }>()
const sources = { human: 'Человек', model: 'Модель', script: 'Сценарий' }
const controls = {
    human: 'Управляется игроком',
    model: 'Управляется ИИ',
    script: 'Сценарное управление',
}
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
                :aria-label="controls[soul.controlSource]"
                :title="controls[soul.controlSource]"
            >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <template v-if="soul.controlSource === 'human'">
                        <rect x="2" y="5" width="20" height="14" rx="2" />
                        <path d="M6 9h1m3 0h1m3 0h1m3 0h1M6 12h1m3 0h1m3 0h1m3 0h1M7 16h10" />
                    </template>
                    <template v-else-if="soul.controlSource === 'model'">
                        <rect x="6" y="6" width="12" height="12" rx="1" />
                        <path
                            d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4M18 9h4m-4 6h4M10 10h4v4h-4z"
                        />
                    </template>
                    <template v-else>
                        <path
                            d="m9 3 1-1h4l1 3 3 1 2-1 2 4-2 2v3l2 1-2 4-3-1-2 2-1 2h-4l-1-3-3-1-2 1-2-4 2-2v-3L2 9l2-4 3 1z"
                        />
                        <circle cx="12" cy="12" r="3" />
                    </template>
                </svg>
            </span>
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
