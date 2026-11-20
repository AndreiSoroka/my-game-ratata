<script setup lang="ts">
import type { SoulSnapshot } from '@my-game-ratata/contracts'

import SoulSpeechIcon from './SoulSpeechIcon.vue'

defineProps<{ soul?: SoulSnapshot }>()
const sources = { human: 'Человек', model: 'Модель', script: 'Сценарий' }
</script>
<template>
    <span v-if="soul" class="soul-badge" :class="`soul-badge--${soul.kind}`">
        {{ soul.kind === 'spark' ? '✧ Искра' : '◌ Эхо' }}
        <span class="soul-badge__details">
            {{ sources[soul.controlSource] }} ·
            <span class="soul-badge__speech">
                <SoulSpeechIcon class="soul-badge__speech-icon" :is-can-speak="soul.canSpeak" />
                {{ soul.canSpeak ? 'Есть речь' : 'Без речи' }}
            </span>
        </span>
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
.soul-badge__details {
    color: #a8b4a5;
    flex-wrap: wrap;
}

.soul-badge__details,
.soul-badge__speech {
    display: inline-flex;
    align-items: center;
    gap: 4px;
}

.soul-badge__speech-icon {
    font-size: 14px;
}
</style>
