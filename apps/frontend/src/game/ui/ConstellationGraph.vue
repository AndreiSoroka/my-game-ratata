<script setup lang="ts">
import type { ConstellationNodeSnapshot, ConstellationSnapshot } from '@my-game-ratata/contracts'
import { computed, nextTick, ref } from 'vue'

import { useConstellationViewport } from './useConstellationViewport'

const props = defineProps<{ constellation: ConstellationSnapshot; selectedId?: string }>()
const emit = defineEmits<{ select: [id: string] }>()
const { svg, zoom, bounds, viewBox, unitScale, reset, focusPath, scale, down, move, up, didDrag } =
    useConstellationViewport(() => props.constellation.nodes)
const nodeById = computed(() => new Map(props.constellation.nodes.map((node) => [node.id, node])))
const colors = computed(
    () => new Map(props.constellation.paths.map((path) => [path.id, path.color]))
)
const focusedId = ref('')
const tabStop = computed(
    () => focusedId.value || props.selectedId || props.constellation.nodes[0]?.id
)
function choose(node: ConstellationNodeSnapshot): void {
    if (didDrag()) return
    emit('select', node.id)
    if (node.kind === 'root') focusPath(node)
}
function nodeKey(event: KeyboardEvent, node: ConstellationNodeSnapshot): void {
    const direction = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
    }[event.code]
    if (direction) {
        event.preventDefault()
        const [dx = 0, dy = 0] = direction
        const next = props.constellation.nodes
            .filter(
                (candidate) =>
                    candidate.id !== node.id &&
                    (candidate.x - node.x) * dx + (candidate.y - node.y) * dy > 0
            )
            .sort((a, b) => {
                const score = (candidate: ConstellationNodeSnapshot) =>
                    Math.hypot(candidate.x - node.x, candidate.y - node.y) +
                    Math.abs((candidate.x - node.x) * dy - (candidate.y - node.y) * dx) * 2
                return score(a) - score(b)
            })[0]
        if (next) {
            focusedId.value = next.id
            emit('select', next.id)
            void nextTick(() =>
                svg.value?.querySelector<SVGGElement>(`[data-node-id="${next.id}"]`)?.focus()
            )
        }
    } else if (['Enter', 'Space', 'KeyE'].includes(event.code)) {
        event.preventDefault()
        if (!event.repeat) choose(node)
    } else if (event.code === 'Equal' || event.code === 'NumpadAdd') {
        event.preventDefault()
        scale(1.2)
    } else if (event.code === 'Minus' || event.code === 'NumpadSubtract') {
        event.preventDefault()
        scale(1 / 1.2)
    } else if (event.code === 'Home') {
        event.preventDefault()
        reset()
    }
}
</script>

<template>
    <div class="constellation-map">
        <div class="constellation-map__tools" aria-label="Масштаб небосвода">
            <button type="button" aria-label="Приблизить небосвод" @click="scale(1.25)">+</button>
            <button type="button" aria-label="Отдалить небосвод" @click="scale(0.8)">−</button>
            <button type="button" aria-label="Показать весь небосвод" @click="reset">⌖</button>
        </div>
        <svg
            ref="svg"
            :viewBox="viewBox"
            class="constellation-map__sky"
            role="group"
            aria-label="Созвездия развития"
            @wheel.prevent="scale($event.deltaY < 0 ? 1.1 : 1 / 1.1)"
            @pointerdown="down"
            @pointermove="move"
            @pointerup="up"
            @pointercancel="up"
        >
            <defs>
                <pattern
                    id="character-sky-stars"
                    width="71"
                    height="61"
                    patternUnits="userSpaceOnUse"
                >
                    <circle cx="9" cy="12" r="0.7" fill="#a9ccd4" opacity=".35" />
                    <circle cx="47" cy="43" r=".5" fill="#c8d5cb" opacity=".25" />
                </pattern>
            </defs>
            <rect
                :x="bounds.x - bounds.width * 3"
                :y="bounds.y - bounds.height * 3"
                :width="bounds.width * 7"
                :height="bounds.height * 7"
                fill="url(#character-sky-stars)"
            />
            <template v-for="edge in constellation.edges" :key="`${edge.from}:${edge.to}`">
                <line
                    v-if="nodeById.get(edge.from) && nodeById.get(edge.to)"
                    :x1="nodeById.get(edge.from)!.x"
                    :y1="nodeById.get(edge.from)!.y"
                    :x2="nodeById.get(edge.to)!.x"
                    :y2="nodeById.get(edge.to)!.y"
                    :stroke="colors.get(nodeById.get(edge.to)!.constellationId)"
                    :opacity="nodeById.get(edge.to)!.unlocked ? 0.7 : 0.22"
                    :stroke-dasharray="nodeById.get(edge.to)!.unlocked ? undefined : '3 4'"
                    stroke-width="1.4"
                />
            </template>
            <g
                v-for="node in constellation.nodes"
                :key="node.id"
                :data-node-id="node.id"
                class="constellation-node"
                :class="{
                    'constellation-node--selected': selectedId === node.id,
                    'constellation-node--closed': !node.unlocked,
                }"
                :transform="`translate(${node.x},${node.y})`"
                :style="{ color: colors.get(node.constellationId) }"
                role="button"
                :tabindex="tabStop === node.id ? 0 : -1"
                :aria-label="`${node.name ?? 'Неизвестная звезда'} · ${node.unlocked ? 'открыта' : 'не открыта'}`"
                :aria-pressed="selectedId === node.id"
                @focus="focusedId = node.id"
                @click="choose(node)"
                @keydown.stop="nodeKey($event, node)"
            >
                <circle class="constellation-node__focus" :r="22 * unitScale" />
                <circle class="constellation-node__halo" :r="node.kind === 'root' ? 12 : 8" />
                <path v-if="node.kind === 'root'" d="M0 -8 8 0 0 8 -8 0Z" />
                <circle v-else :r="node.kind === 'joint' ? 5 : 3" />
                <text
                    v-if="node.kind === 'root' || (node.unlocked && zoom > 1.25)"
                    :y="22 * unitScale"
                    :style="{ fontSize: `${(node.kind === 'root' ? 14 : 11) * unitScale}px` }"
                    text-anchor="middle"
                >
                    {{ node.name }}
                </text>
                <text v-else y="4" text-anchor="middle" class="constellation-node__unknown">?</text>
            </g>
        </svg>
        <p class="constellation-map__help">
            Перетаскивайте небосвод · + / − масштаб · стрелки выбирают звёзды
        </p>
    </div>
</template>

<style scoped>
.constellation-map {
    position: relative;
    min-width: 0;
    overflow: hidden;
    border: 1px solid #3a5663;
    background:
        radial-gradient(ellipse at 20% 25%, #183e4a80, transparent 55%),
        radial-gradient(ellipse at 75% 80%, #40312566, transparent 55%), #08151f;
}
.constellation-map__sky {
    display: block;
    width: 100%;
    height: 450px;
    touch-action: none;
    user-select: none;
    cursor: grab;
}
.constellation-map__sky:active {
    cursor: grabbing;
}
.constellation-map__tools {
    position: absolute;
    top: 12px;
    right: 12px;
    display: flex;
    gap: 5px;
    z-index: 1;
}
.constellation-map__tools button {
    width: 36px;
    height: 36px;
    border: 1px solid #68818b;
    background: #102832e8;
    color: #e8d4a8;
    font-size: 20px;
    cursor: pointer;
}
.constellation-map__tools button:focus-visible {
    outline: 2px solid #ffe0a1;
}
.constellation-node {
    color: #c6dce0;
    cursor: pointer;
    outline: none;
}
.constellation-node circle,
.constellation-node path {
    stroke: currentColor;
    fill: currentColor;
}
.constellation-node__halo {
    fill: none !important;
    opacity: 0.4;
}
.constellation-node__focus {
    fill: none !important;
    stroke: transparent !important;
    pointer-events: all;
}
.constellation-node--selected .constellation-node__focus,
.constellation-node:focus-visible .constellation-node__focus {
    stroke: #fff4c9 !important;
    stroke-dasharray: 2 3;
}
.constellation-node--closed circle,
.constellation-node--closed path {
    fill: #122530;
    opacity: 0.5;
}
.constellation-node text {
    fill: currentColor;
    font: 10px system-ui;
    paint-order: stroke;
    stroke: #08151f;
    stroke-width: 3px;
}
.constellation-node .constellation-node__unknown {
    font-size: 9px;
    stroke: none;
}
.constellation-map__help {
    margin: 0;
    padding: 8px 12px;
    border-top: 1px solid #294350;
    color: #8ca5b4;
    font-size: 10px;
}
@media (max-width: 600px) {
    .constellation-map__sky {
        height: 340px;
    }
    .constellation-map__help {
        font-size: 9px;
    }
}
</style>
