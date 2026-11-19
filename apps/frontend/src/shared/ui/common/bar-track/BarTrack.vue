<script setup lang="ts">
import './barTrack.css'

import { computed } from 'vue'

import { lightUiColors } from '@/shared/ui/theme'

import type { BarTrackProps } from './types'

const props = withDefaults(defineProps<BarTrackProps>(), {
    color: lightUiColors.bar.track,
    height: 24,
    shadow: true,
})
const decoration = computed(() => ({
    '--bar-track-color': props.color,
    '--bar-track-height': `${Number.isFinite(props.height) ? Math.max(8, props.height) : 24}px`,
}))
</script>

<template>
    <div class="bar-track" :data-shadow="shadow" :style="decoration">
        <div class="bar-track__content"><slot /></div>
    </div>
</template>
