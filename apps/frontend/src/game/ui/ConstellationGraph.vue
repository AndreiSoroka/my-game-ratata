<script setup lang="ts">
import type { ConstellationNodeSnapshot, ConstellationSnapshot } from '@my-game-ratata/contracts'
import { computed, nextTick, ref } from 'vue'

import ConstellationBackground from './ConstellationBackground.vue'
import { constellationLabels } from './constellationLabels'
import { nextConstellationNode } from './constellationNavigation'
import ConstellationStar from './ConstellationStar.vue'
import { useConstellationViewport } from './useConstellationViewport'

const props = defineProps<{
    constellation: ConstellationSnapshot
    selectedId?: string
    enabledStarIds?: ReadonlySet<string>
}>()
const emit = defineEmits<{ select: [id: string]; activate: [id: string] }>()
const {
    svg,
    viewBox,
    visibleBounds,
    unitScale,
    detailed,
    reset,
    focusPath,
    focusStar,
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
const backgroundSeed = computed(() =>
    props.constellation.nodes
        .filter((node) => node.parents.length === 0)
        .map((node) => `${node.id}:${node.x}:${node.y}`)
        .join('|')
)
const interactiveNodes = computed(() =>
    props.constellation.nodes.filter(
        (node) => canInteract(node) && (detailed.value || node.parents.length === 0)
    )
)
const labels = computed(() =>
    constellationLabels(
        props.constellation,
        props.selectedId,
        detailed.value,
        unitScale.value,
        visibleBounds.value
    ).map((label) =>
        props.enabledStarIds !== undefined && !props.enabledStarIds.has(label.id)
            ? { ...label, color: '#8b969e' }
            : label
    )
)
function canInteract(node: ConstellationNodeSnapshot): boolean {
    return props.enabledStarIds !== undefined || node.unlocked
}
function nodeEnabled(node: ConstellationNodeSnapshot): boolean {
    return node.unlocked && (props.enabledStarIds?.has(node.id) ?? true)
}
function edgeEnabled(from: string, to: string): boolean {
    const target = nodeById.value.get(to)
    if (!target) return false
    if (props.enabledStarIds === undefined) return target.unlocked
    const source = nodeById.value.get(from)
    return source !== undefined && nodeEnabled(source) && nodeEnabled(target)
}
const tabStop = computed(
    () =>
        interactiveNodes.value.find((node) => node.id === focusedId.value)?.id ??
        interactiveNodes.value.find((node) => node.id === props.selectedId)?.id ??
        interactiveNodes.value[0]?.id
)
function resetSky(): void {
    reset()
    const center = props.constellation.layout?.centerNodeId
    if (center && nodeById.value.get(center) && canInteract(nodeById.value.get(center)!))
        emit('select', center)
}
function focusNode(id: string): void {
    const node = nodeById.value.get(id)
    if (!node || !canInteract(node)) return
    emit('select', node.id)
    if (node.parents.length === 0) focusPath(node)
    else focusStar(node)
}
defineExpose({ focusNode })
function choose(node: ConstellationNodeSnapshot, pointer = true): void {
    if ((pointer && didDrag()) || !interactiveNodes.value.some((entry) => entry.id === node.id))
        return
    focusedId.value = node.id
    void nextTick(() =>
        svg.value?.querySelector<SVGGElement>(`[data-node-id="${node.id}"]`)?.focus()
    )
    emit('select', node.id)
    if (node.parents.length === 0) focusPath(node)
}
function nodeKey(event: KeyboardEvent, node: ConstellationNodeSnapshot): void {
    if (!interactiveNodes.value.some((entry) => entry.id === node.id)) return
    const direction = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
    }[event.code]
    if (direction) {
        event.preventDefault()
        const next = nextConstellationNode(interactiveNodes.value, node, direction)
        if (next) {
            focusedId.value = next.id
            emit('select', next.id)
            ensureVisible(next)
            void nextTick(() =>
                svg.value?.querySelector<SVGGElement>(`[data-node-id="${next.id}"]`)?.focus()
            )
        }
    } else if (event.code === 'Space' && props.enabledStarIds !== undefined) {
        event.preventDefault()
        if (!event.repeat) {
            emit('select', node.id)
            emit('activate', node.id)
        }
    } else if (['Enter', 'Space', 'KeyE'].includes(event.code)) {
        event.preventDefault()
        if (!event.repeat) choose(node, false)
    } else cameraKey(event)
}
function cameraKey(event: KeyboardEvent): void {
    switch (event.code) {
        case 'Equal':
        case 'NumpadAdd':
            event.preventDefault()
            scale(1.2)
            break
        case 'Minus':
        case 'NumpadSubtract':
            event.preventDefault()
            scale(1 / 1.2)
            break
        case 'Home':
            event.preventDefault()
            resetSky()
            break
    }
}
</script>

<template>
    <div class="constellation-map">
        <div class="constellation-map__tools" aria-label="Масштаб небосвода">
            <button type="button" aria-label="Приблизить небосвод" @click="scale(1.25)">+</button>
            <button type="button" aria-label="Отдалить небосвод" @click="scale(0.8)">−</button>
            <button type="button" aria-label="Показать весь небосвод" @click="resetSky">⌖</button>
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
            <rect
                :x="visibleBounds.x"
                :y="visibleBounds.y"
                :width="visibleBounds.width"
                :height="visibleBounds.height"
                fill="transparent"
            />
            <ConstellationBackground
                :view="visibleBounds"
                :unit-scale="unitScale"
                :seed="backgroundSeed"
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
                        edgeEnabled(edge.from, edge.to)
                            ? colors.get(nodeById.get(edge.to)!.constellationId)
                            : '#8b969e'
                    "
                    :opacity="edgeEnabled(edge.from, edge.to) ? 0.7 : 0.2"
                    :class="{ 'constellation-edge--cross-link': edge.crossLink }"
                    :stroke-dasharray="
                        edge.crossLink
                            ? '8 4 2 4'
                            : edgeEnabled(edge.from, edge.to)
                              ? undefined
                              : '3 4'
                    "
                    stroke-width="1.4"
                    vector-effect="non-scaling-stroke"
                >
                    <title v-if="edge.crossLink">Дополнительная обязательная связь</title>
                </polyline>
            </template>
            <ConstellationStar
                v-for="node in constellation.nodes"
                :key="node.id"
                :node="node"
                :color="colors.get(node.constellationId) ?? '#dce6dd'"
                :selected="selectedId === node.id && canInteract(node)"
                :enabled="enabledStarIds === undefined ? undefined : nodeEnabled(node)"
                :interactive="interactiveNodes.some((entry) => entry.id === node.id)"
                :tab-stop="tabStop === node.id"
                :show-halo="detailed || node.parents.length === 0"
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
            Перетаскивайте небосвод · + / − масштаб · клик и стрелки выбирают звёзды
            <template v-if="enabledStarIds !== undefined">
                · Пробел включает или отключает</template
            >
        </p>
    </div>
</template>

<style scoped src="./constellationGraph.css"></style>
