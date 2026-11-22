<script setup lang="ts">
import type { ConstellationNodeSnapshot, ConstellationSnapshot } from '@my-game-ratata/contracts'
import { computed, nextTick, ref } from 'vue'

import { hudPanelButtonColors, UiButton } from '@/shared/ui/common'
import { FantasyBorder } from '@/shared/ui/external'
import { useDarkPanelTheme } from '@/shared/ui/theme'

import { projectConstellationBranches } from '../model/constellationParallax'
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
const theme = useDarkPanelTheme()
const {
    svg,
    zoom,
    dragOffset,
    dimensions,
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
const displayedSky = computed(() =>
    projectConstellationBranches(props.constellation, dragOffset.value, unitScale.value)
)
const nodeById = computed(() => new Map(props.constellation.nodes.map((node) => [node.id, node])))
const colors = computed(
    () => new Map(props.constellation.paths.map((path) => [path.id, path.color]))
)
const focusedId = ref('')
const closedVisibility = computed(() => {
    if (props.enabledStarIds !== undefined) return 1
    const progress = Math.max(0, Math.min(1, (zoom.value - 1) / 2))
    return progress * progress * (3 - 2 * progress)
})
const backgroundSeed = computed(() =>
    props.constellation.nodes
        .filter((node) => node.parents.length === 0)
        .map((node) => `${node.id}:${node.x}:${node.y}`)
        .join('|')
)
const interactiveNodes = computed(() =>
    displayedSky.value.nodes.filter(
        (node) => canInteract(node) && (detailed.value || node.parents.length === 0)
    )
)
const labels = computed(() =>
    constellationLabels(
        displayedSky.value,
        props.selectedId,
        detailed.value,
        unitScale.value,
        visibleBounds.value,
        closedVisibility.value > 0
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
const edges = computed(() => {
    const nodes = new Map(displayedSky.value.nodes.map((node) => [node.id, node]))
    return displayedSky.value.edges.flatMap(({ from, to, via, crossLink }) => {
        const source = nodes.get(from)
        const target = nodes.get(to)
        if (!source || !target) return []
        const enabled =
            props.enabledStarIds === undefined
                ? target.unlocked
                : nodeEnabled(source) && nodeEnabled(target)
        const visibility = source.unlocked && target.unlocked ? 1 : closedVisibility.value
        return [
            {
                id: `${from}:${to}`,
                points: [source, ...(via ?? []), target]
                    .map((point) => `${point.x},${point.y}`)
                    .join(' '),
                color: enabled ? colors.value.get(target.constellationId) : '#8b969e',
                opacity: (enabled ? 0.7 : 0.2) * visibility,
                dash: crossLink ? '8 4 2 4' : enabled ? undefined : '3 4',
                crossLink,
            },
        ]
    })
})
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
    if (node.parents.length === 0) focusPath(nodeById.value.get(node.id)!)
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
            ensureVisible(nodeById.value.get(next.id)!, next)
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
    <FantasyBorder
        class="constellation-map"
        :border="theme?.border ?? 'border-014'"
        :color="theme?.accent ?? 'var(--ui-dark-panel-border)'"
        :border-width="5"
        :style="{ '--constellation-closed-visibility': closedVisibility }"
    >
        <div class="constellation-map__tools" aria-label="Масштаб небосвода">
            <UiButton
                appearance="panel"
                :colors="hudPanelButtonColors"
                aria-label="Приблизить небосвод"
                @click="scale(1.25)"
                >+</UiButton
            >
            <UiButton
                appearance="panel"
                :colors="hudPanelButtonColors"
                aria-label="Отдалить небосвод"
                @click="scale(0.8)"
                >−</UiButton
            >
            <UiButton
                appearance="panel"
                :colors="hudPanelButtonColors"
                aria-label="Показать весь небосвод"
                @click="resetSky"
                >⌖</UiButton
            >
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
                :origin="visibleBounds"
                :dimensions="dimensions"
                :unit-scale="unitScale"
                :seed="backgroundSeed"
                :zoom="zoom"
                :pan="dragOffset"
            />
            <polyline
                v-for="edge in edges"
                :key="edge.id"
                :points="edge.points"
                fill="none"
                :stroke="edge.color"
                :opacity="edge.opacity"
                :pointer-events="edge.opacity === 0 ? 'none' : undefined"
                :class="{ 'constellation-edge--cross-link': edge.crossLink }"
                :stroke-dasharray="edge.dash"
                stroke-width="1.4"
                vector-effect="non-scaling-stroke"
            >
                <title v-if="edge.crossLink">Дополнительная обязательная связь</title>
            </polyline>
            <ConstellationStar
                v-for="node in displayedSky.nodes"
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
                :opacity="nodeById.get(label.id)?.unlocked ? 1 : closedVisibility"
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
    </FantasyBorder>
</template>

<style scoped src="./constellationGraph.css"></style>
