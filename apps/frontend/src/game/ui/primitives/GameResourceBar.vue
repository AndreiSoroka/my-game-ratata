<script setup lang="ts">
import './gameUi.css'

import type { HealthSnapshot } from '@my-game-ratata/contracts'
import { computed } from 'vue'

import { healthBarPercent, healthText } from '@/entities/player-vitals'

const props = defineProps<{ value: HealthSnapshot; kind: 'hp' | 'mana' | 'energy' }>()
const percent = computed(() => healthBarPercent(props.value))
const text = computed(() => healthText(props.value))
</script>

<template>
    <span
        class="game-resource-bar"
        :class="`game-resource-bar--${kind}`"
        role="progressbar"
        :aria-valuenow="percent"
        :aria-valuetext="text || undefined"
        :aria-valuemin="0"
        :aria-valuemax="100"
    >
        <span class="game-resource-bar__fill" :style="{ width: `${percent}%` }" />
        <span v-if="value.kind === 'exact'" class="game-resource-bar__text" aria-hidden="true">{{
            text
        }}</span>
    </span>
</template>
