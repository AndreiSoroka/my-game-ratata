<script setup lang="ts">
import type { ConstellationNodeSnapshot, ConstellationSnapshot } from '@my-game-ratata/contracts'
import { computed, nextTick, ref } from 'vue'

import { constellationLabels } from './constellationLabels'
import ConstellationStar from './ConstellationStar.vue'
import { useConstellationViewport } from './useConstellationViewport'

const props = defineProps<{ constellation: ConstellationSnapshot; selectedId?: string }>()
const emit = defineEmits<{ select: [id: string] }>()
const {
    svg,
    bounds,
    viewBox,
    visibleBounds,
    unitScale,
    detailed,
    reset,
    focusPath,
    ensureVisible,
    scale,
    down,
    move,
    up,
    didDrag,
} = useConstellationViewport(() => props.constellation)
const nodeById = computed(() => new Map(props.constellation.nodes.map((node) => [node.id, node])))
const colors = computed(
    () => new Map(props.constellation.paths.map((path) => [path.id, path.color]))
)
const focusedId = ref('')
const interactiveNodes = computed(() =>
    props.constellation.nodes.filter((node) => detailed.value || node.parents.length === 0)
)
const labels = computed(() =>
    constellationLabels(
        props.constellation,
        props.selectedId,
        detailed.value,
        unitScale.value,
        visibleBounds.value
    )
)
const tabStop = computed(
    () =>
        interactiveNodes.value.find((node) => node.id === focusedId.value)?.id ??
        interactiveNodes.value.find((node) => node.id === props.selectedId)?.id ??
        interactiveNodes.value[0]?.id
)
function choose(node: ConstellationNodeSnapshot, pointer = true): void {
    if (pointer && didDrag()) return
    emit('select', node.id)
    if (node.parents.length === 0) focusPath(node)
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
        const next = interactiveNodes.value
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
            ensureVisible(next)
            void nextTick(() =>
                svg.value?.querySelector<SVGGElement>(`[data-node-id="${next.id}"]`)?.focus()
            )
        }
    } else if (['Enter', 'Space', 'KeyE'].includes(event.code)) {
        event.preventDefault()
        if (!event.repeat) choose(node, false)
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
            @lostpointercapture="up"
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
                <polyline
                    v-if="nodeById.get(edge.from) && nodeById.get(edge.to)"
                    :points="
                        [nodeById.get(edge.from)!, ...(edge.via ?? []), nodeById.get(edge.to)!]
                            .map((point) => `${point.x},${point.y}`)
                            .join(' ')
                    "
                    fill="none"
                    :stroke="
                        nodeById.get(edge.to)!.unlocked
                            ? colors.get(nodeById.get(edge.to)!.constellationId)
                            : '#8b969e'
                    "
                    :opacity="nodeById.get(edge.to)!.unlocked ? 0.7 : 0.2"
                    :stroke-dasharray="nodeById.get(edge.to)!.unlocked ? undefined : '3 4'"
                    stroke-width="1.4"
                />
            </template>
            <ConstellationStar
                v-for="node in constellation.nodes"
                :key="node.id"
                :node="node"
                :color="colors.get(node.constellationId) ?? '#dce6dd'"
                :selected="selectedId === node.id"
                :interactive="detailed || node.parents.length === 0"
                :tab-stop="tabStop === node.id"
                :unit-scale="unitScale"
                @focus="focusedId = node.id"
                @select="choose(node)"
                @key="nodeKey($event, node)"
            />
            <foreignObject
                v-for="label in labels"
                :key="label.id"
                :x="label.x"
                :y="label.y"
                :width="label.width"
                :height="label.height"
                aria-hidden="true"
                class="constellation-label"
            >
                <div :style="{ fontSize: `${label.fontSize}px`, color: label.color }">
                    {{ label.text }}
                </div>
            </foreignObject>
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
.constellation-label {
    pointer-events: none;
    overflow: hidden;
}
.constellation-label div {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-align: center;
    background: #08151fe8;
    line-height: 1.25;
    padding: 2% 4%;
    box-sizing: border-box;
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
