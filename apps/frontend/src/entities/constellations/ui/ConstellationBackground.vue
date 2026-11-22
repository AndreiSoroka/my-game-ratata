<script setup lang="ts">
import type { Vector2 } from '@my-game-ratata/contracts'
import { computed, useId } from 'vue'

interface Star extends Vector2 {
    radius: number
    opacity: number
}

const props = defineProps<{
    origin: Vector2
    dimensions: { width: number; height: number }
    unitScale: number
    seed: string
    zoom: number
    pan: Vector2
}>()
const maximumStars = 320
const depths = [0, 0.25, 0.5, 0.75, 1]
const id = useId()

const layers = computed(() => {
    const { width, height } = props.dimensions
    const count = Math.max(32, Math.min(maximumStars, Math.round((width * height) / 5000)))
    let state = 2166136261
    for (const symbol of props.seed) state = Math.imul(state ^ symbol.charCodeAt(0), 16777619)
    const random = () => {
        state = (state + 0x6d2b79f5) | 0
        let value = Math.imul(state ^ (state >>> 15), 1 | state)
        value ^= value + Math.imul(value ^ (value >>> 7), 61 | value)
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296
    }
    const field = depths.map(() => [] as Star[])
    for (let index = 0; index < count; index++) {
        field[index % depths.length]!.push({
            x: random() * width,
            y: random() * height,
            radius: 0.3 + random() * 0.6,
            opacity: 0.12 + random() * 0.24,
        })
    }
    return field
})
const transforms = computed(() => {
    const { width, height } = props.dimensions
    const zoomSteps = Math.log2(Math.max(1, props.zoom))
    const zoomProgress = zoomSteps / (3 + zoomSteps)
    return depths.map((depth) => {
        const expansion = (0.12 + depth * 0.32) * zoomProgress
        const scale = 1 + expansion
        const panRate = 0.06 + depth * 0.09
        const x = wrap(props.pan.x * panRate, width) * scale - (width / 2) * expansion
        const y = wrap(props.pan.y * panRate, height) * scale - (height / 2) * expansion
        return `matrix(${scale} 0 0 ${scale} ${x} ${y})`
    })
})

function wrap(position: number, size: number): number {
    return position - Math.floor(position / size) * size
}
</script>

<template>
    <g
        aria-hidden="true"
        class="constellation-background"
        :transform="`translate(${origin.x},${origin.y}) scale(${unitScale})`"
        pointer-events="none"
    >
        <defs v-memo="[layers]">
            <g v-for="(stars, layer) in layers" :id="`${id}-stars-${layer}`" :key="layer">
                <circle
                    v-for="(star, index) in stars"
                    :key="index"
                    :cx="star.x"
                    :cy="star.y"
                    :r="star.radius"
                    :opacity="star.opacity"
                    fill="#b3ccd1"
                />
            </g>
        </defs>
        <defs>
            <pattern
                v-for="(transform, layer) in transforms"
                :id="`${id}-sky-${layer}`"
                :key="layer"
                class="constellation-background__layer"
                patternUnits="userSpaceOnUse"
                :width="dimensions.width"
                :height="dimensions.height"
                :patternTransform="transform"
            >
                <use :href="`#${id}-stars-${layer}`" />
            </pattern>
        </defs>
        <rect
            v-for="(_, layer) in depths"
            :key="layer"
            :width="dimensions.width"
            :height="dimensions.height"
            :fill="`url(#${id}-sky-${layer})`"
        />
    </g>
</template>
