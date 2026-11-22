<script setup lang="ts">
import type { ConstellationNodeSnapshot } from '@my-game-ratata/contracts'

defineProps<{
    node: ConstellationNodeSnapshot
    color: string
    selected: boolean
    enabled?: boolean
    interactive: boolean
    showHalo?: boolean
    tabStop: boolean
    unitScale: number
}>()
const emit = defineEmits<{ select: []; focus: []; key: [event: KeyboardEvent] }>()
</script>
<template>
    <g
        :data-node-id="node.id"
        class="constellation-node"
        :class="{
            selected,
            closed: !node.unlocked,
            inactive: enabled === false,
            inert: !interactive,
            compact: showHalo === false,
        }"
        :transform="`translate(${node.x},${node.y})`"
        :style="{ color: node.unlocked && enabled !== false ? color : '#8b969e' }"
        :role="interactive ? 'button' : undefined"
        :tabindex="interactive ? (tabStop ? 0 : -1) : undefined"
        :aria-hidden="!interactive || undefined"
        :aria-label="node.unlocked && node.name ? node.name : 'Неизвестно'"
        :aria-pressed="interactive ? (enabled ?? selected) : undefined"
        :aria-current="selected ? 'true' : undefined"
        :data-enabled="enabled"
        @focus="interactive && emit('focus')"
        @click="emit('select')"
        @keydown.stop="emit('key', $event)"
    >
        <circle class="hit" :r="22 * unitScale" />
        <circle class="halo" :r="(node.parents.length === 0 ? 12 : 8) * unitScale" />
        <path
            v-if="node.parents.length === 0"
            :d="`M0 ${-7 * unitScale} ${7 * unitScale} 0 0 ${7 * unitScale} ${-7 * unitScale} 0Z`"
        />
        <circle v-else :r="(node.kind === 'joint' ? 5 : 3) * unitScale" />
    </g>
</template>
<style scoped>
.constellation-node {
    cursor: pointer;
    outline: none;
}
.constellation-node circle,
.constellation-node path {
    stroke: currentColor;
    fill: currentColor;
    vector-effect: non-scaling-stroke;
}
.halo {
    fill: none !important;
    opacity: 0.4;
}
.hit {
    fill: none !important;
    stroke: transparent !important;
    pointer-events: all;
}
.inactive {
    opacity: 0.5;
}
.closed {
    opacity: calc(0.5 * var(--constellation-closed-visibility, 1));
}
.closed circle:not(.hit),
.closed path,
.inactive circle:not(.hit),
.inactive path {
    fill: #122530;
}
.selected,
.constellation-node:focus-visible {
    opacity: 1;
}
.selected .hit,
.constellation-node:focus-visible .hit {
    stroke: #fff4c9 !important;
    stroke-dasharray: 2 3;
}
.compact .halo {
    display: none;
}
.inert .hit {
    pointer-events: none;
}
.inert {
    pointer-events: none;
    cursor: default;
}
</style>
