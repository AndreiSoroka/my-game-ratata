<script setup lang="ts">
import './barFill.css'

import { computed } from 'vue'

import { lightUiColors } from '@/shared/ui/theme'

import type { BarFillProps } from './types'

const props = withDefaults(defineProps<BarFillProps>(), {
    color: lightUiColors.bar.health.color,
    height: 24,
    shadow: true,
})
const decoration = computed(() => ({
    '--bar-fill-color': props.color,
    '--bar-fill-height': `${Number.isFinite(props.height) ? Math.max(8, props.height) : 24}px`,
}))
</script>

<template>
    <span class="bar-fill" :data-shadow="shadow" :style="decoration" />
</template>
