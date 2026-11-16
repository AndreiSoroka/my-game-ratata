<script setup lang="ts">
import type { ConstellationRegion } from '@my-game-ratata/contracts'
import { computed } from 'vue'

const props = defineProps<{ view: ConstellationRegion; unitScale: number; seed: string }>()
const width = computed(() => props.view.width / props.unitScale)
const height = computed(() => props.view.height / props.unitScale)
const count = computed(() =>
    Math.max(32, Math.min(320, Math.round((width.value * height.value) / 5000)))
)
const stars = computed(() => {
    let state = 2166136261
    for (const symbol of props.seed) state = Math.imul(state ^ symbol.charCodeAt(0), 16777619)
    const random = () => {
        state = (state + 0x6d2b79f5) | 0
        let value = Math.imul(state ^ (state >>> 15), 1 | state)
        value ^= value + Math.imul(value ^ (value >>> 7), 61 | value)
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296
    }
    return Array.from({ length: 320 }, (_, id) => ({
        id,
        x: random(),
        y: random(),
        radius: 0.3 + random() * 0.6,
        opacity: 0.12 + random() * 0.24,
    }))
})
</script>

<template>
    <g
        aria-hidden="true"
        class="constellation-background"
        :transform="`translate(${view.x},${view.y}) scale(${unitScale})`"
        pointer-events="none"
    >
        <circle
            v-for="star in stars.slice(0, count)"
            :key="star.id"
            :cx="star.x * width"
            :cy="star.y * height"
            :r="star.radius"
            :opacity="star.opacity"
            fill="#b3ccd1"
        />
    </g>
</template>
