<script setup lang="ts">
import type { ConstellationNodeSnapshot } from '@my-game-ratata/contracts'
import { computed } from 'vue'

import { tGame, tLocalized } from '@/shared/lib/i18n'

const props = defineProps<{
    node: ConstellationNodeSnapshot
    color: string
    selected: boolean
    enabled?: boolean
    interactive: boolean
    hitRadius?: number
    showHalo?: boolean
    tabStop: boolean
    unitScale: number
}>()
const emit = defineEmits<{ select: []; focus: []; key: [event: KeyboardEvent] }>()
const markerScale = computed(() => props.unitScale * (props.enabled === false ? 0.85 : 1))
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
        :aria-label="
            node.unlocked && node.name
                ? tLocalized(node.nameMessage, node.name)
                : tGame('game.knowledge.unknown')
        "
        :aria-pressed="interactive ? (enabled ?? selected) : undefined"
        :aria-current="selected ? 'true' : undefined"
        :data-enabled="enabled"
        @focus="interactive && emit('focus')"
        @click="emit('select')"
        @keydown.stop="emit('key', $event)"
    >
        <circle class="hit" :r="hitRadius ?? 22 * unitScale" />
        <circle class="halo" :r="(node.parents.length === 0 ? 12 : 8) * markerScale" />
        <path
            v-if="node.parents.length === 0"
            :d="`M0 ${-7 * markerScale} ${7 * markerScale} 0 0 ${7 * markerScale} ${-7 * markerScale} 0Z`"
        />
        <circle v-else :r="(node.kind === 'joint' ? 5 : 3) * markerScale" />
    </g>
</template>
<style scoped>
.constellation-node {
    cursor: pointer;
    outline: none;
    pointer-events: none;
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
    transition: opacity 120ms ease-out;
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
.closed.selected,
.closed:focus-visible {
    opacity: var(--constellation-closed-visibility, 1);
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
    cursor: default;
}
@media (prefers-reduced-motion: reduce) {
    .closed {
        transition: none;
    }
}
</style>
