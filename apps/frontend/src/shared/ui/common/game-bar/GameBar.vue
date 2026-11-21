<script setup lang="ts">
import './gameBar.css'

import { computed } from 'vue'

import { BarFill } from '@/shared/ui/common/bar-fill'
import { BarTrack } from '@/shared/ui/common/bar-track'
import { lightUiColors } from '@/shared/ui/theme'

import type { GameBarProps } from './gameBarProps'

const props = withDefaults(defineProps<GameBarProps>(), {
    max: 100,
    color: lightUiColors.bar.health.color,
    trackColor: lightUiColors.bar.track,
    textColor: lightUiColors.bar.text,
    height: 24,
    label: 'Прогресс',
    showValue: false,
    shadow: true,
})
const progress = computed(() => {
    const max = Number.isFinite(props.max) && props.max > 0 ? props.max : 100
    const value = Math.min(max, Math.max(0, Number.isFinite(props.value) ? props.value : 0))
    return { value, max, percent: (value / max) * 100 }
})
const decoration = computed(() => ({
    '--game-bar-text-color': props.textColor,
    '--game-bar-percent': `${progress.value.percent}%`,
}))
const valueText = computed(
    () => `${Number(progress.value.value.toFixed(1))} / ${Number(progress.value.max.toFixed(1))}`
)
</script>

<template>
    <div
        class="game-bar"
        :data-shadow="shadow"
        :style="decoration"
        role="progressbar"
        :aria-label="label"
        :aria-valuemin="0"
        :aria-valuemax="progress.max"
        :aria-valuenow="progress.value"
    >
        <BarTrack :color="trackColor" :height="height" :shadow="shadow">
            <BarFill
                v-show="progress.percent > 0"
                class="game-bar__fill"
                :color="color"
                :shadow="shadow"
                :data-full="progress.value === progress.max"
                aria-hidden="true"
            />
            <span v-if="showValue || $slots.default" class="game-bar__label">
                <slot>{{ valueText }}</slot>
            </span>
        </BarTrack>
    </div>
</template>
