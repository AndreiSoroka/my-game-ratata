<script setup lang="ts">
import type { ConstellationNodeSnapshot, ConstellationSnapshot } from '@my-game-ratata/contracts'
import { computed, nextTick, ref, watch } from 'vue'

import { tGame } from '@/shared/lib/i18n'
import { navigationDirection } from '@/shared/lib/input'
import { constellationButtonColors, UiButton } from '@/shared/ui/common'
import { FantasyBorder } from '@/shared/ui/external'
import { useDarkPanelTheme } from '@/shared/ui/theme'

import { projectConstellationStars } from '../model/constellationParallax'
import ConstellationBackground from './ConstellationBackground.vue'
import { constellationLabels } from './constellationLabels'
import { constellationHitTargets, nextConstellationNode } from './constellationNavigation'
import { constellationEdges, constellationVisibility } from './constellationPresentation'
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
const displayedSky = computed(() => {
    const { x, y, width, height } = visibleBounds.value
    return projectConstellationStars(props.constellation, {
        center: { x: x + width / 2, y: y + height / 2 },
        zoom: zoom.value,
    })
})
const nodeById = computed(() => new Map(props.constellation.nodes.map((node) => [node.id, node])))
const colors = computed(
    () => new Map(props.constellation.paths.map((path) => [path.id, path.color]))
)
const focusedId = ref('')
const nodeVisibility = computed(() => constellationVisibility(zoom.value))
const markerVisible = (node: ConstellationNodeSnapshot) => nodeVisibility.value(node) > 0
const backgroundSeed = computed(() =>
    props.constellation.nodes
        .filter((node) => node.parents.length === 0)
        .map((node) => `${node.id}:${node.x}:${node.y}`)
        .join('|')
)
const hitTargets = computed(() =>
    constellationHitTargets(
        displayedSky.value.nodes,
        unitScale.value,
        zoom.value === 1,
        props.enabledStarIds !== undefined,
        markerVisible
    )
)
const interactiveNodes = computed(() =>
    displayedSky.value.nodes.filter((node) => hitTargets.value.has(node.id))
)
const labels = computed(() =>
    constellationLabels(
        displayedSky.value,
        props.selectedId,
        detailed.value,
        unitScale.value,
        visibleBounds.value,
        markerVisible
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
const edges = computed(() =>
    constellationEdges(
        displayedSky.value,
        colors.value,
        nodeVisibility.value,
        props.enabledStarIds === undefined ? undefined : nodeEnabled
    )
)
const tabStop = computed(() => {
    const selected = [focusedId.value, props.selectedId].find(
        (id) => id && hitTargets.value.has(id)
    )
    return selected ?? interactiveNodes.value[0]?.id
})
watch(tabStop, (id) => {
    const graph = svg.value
    const active = graph?.ownerDocument.activeElement
    const activeId = active?.getAttribute('data-node-id')
    if (id && graph?.contains(active ?? null) && activeId && !hitTargets.value.has(activeId)) {
        void focusStarElement(id)
    }
})
const focusStarElement = (id: string) =>
    nextTick(() => svg.value?.querySelector<SVGGElement>(`[data-node-id="${id}"]`)?.focus())
function resetSky(): void {
    reset()
    const center = nodeById.value.get(props.constellation.layout?.centerNodeId ?? '')
    if (center && canInteract(center)) emit('select', center.id)
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
    if ((pointer && didDrag()) || !hitTargets.value.has(node.id)) return
    focusedId.value = node.id
    void focusStarElement(node.id)
    emit('select', node.id)
    if (node.parents.length === 0) focusPath(nodeById.value.get(node.id)!)
}
function nodeKey(event: KeyboardEvent, node: ConstellationNodeSnapshot): void {
    if (!hitTargets.value.has(node.id)) return
    const keyDirection = navigationDirection(event)
    const direction =
        keyDirection &&
        {
            left: [-1, 0],
            right: [1, 0],
            up: [0, -1],
            down: [0, 1],
        }[keyDirection]
    if (direction) {
        event.preventDefault()
        const next = nextConstellationNode(interactiveNodes.value, node, direction)
        if (next) {
            focusedId.value = next.id
            emit('select', next.id)
            ensureVisible(nodeById.value.get(next.id)!, next)
            void focusStarElement(next.id)
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
    if (event.code === 'Home') {
        event.preventDefault()
        resetSky()
        return
    }
    const zoomIn = event.code === 'Equal' || event.code === 'NumpadAdd'
    const zoomOut = event.code === 'Minus' || event.code === 'NumpadSubtract'
    if (!zoomIn && !zoomOut) return
    event.preventDefault()
    scale(zoomIn ? 1.2 : 1 / 1.2)
}
</script>

<template>
    <FantasyBorder
        class="constellation-map"
        :border="theme?.border ?? 'border-014'"
        :color="theme?.accent ?? 'var(--ui-dark-panel-border)'"
    >
        <div class="constellation-map__tools" :aria-label="tGame('game.knowledge.skyZoom')">
            <UiButton
                appearance="panel"
                :colors="constellationButtonColors"
                :aria-label="tGame('game.knowledge.zoomInOnSky')"
                @click="scale(1.25)"
                >+</UiButton
            >
            <UiButton
                appearance="panel"
                :colors="constellationButtonColors"
                :aria-label="tGame('game.knowledge.zoomOutFromSky')"
                @click="scale(0.8)"
                >−</UiButton
            >
            <UiButton
                appearance="panel"
                :colors="constellationButtonColors"
                :aria-label="tGame('game.knowledge.fitEntireSky')"
                @click="resetSky"
                >⌖</UiButton
            >
        </div>
        <svg
            ref="svg"
            :viewBox="viewBox"
            class="constellation-map__sky"
            role="group"
            :aria-label="tGame('game.knowledge.progressionConstellations')"
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
                :class="edge.classes"
                :stroke-dasharray="edge.dash"
                stroke-width="1.4"
                vector-effect="non-scaling-stroke"
            >
                <title v-if="edge.crossLink">
                    {{ tGame('game.knowledge.additionalRequiredConnection') }}
                </title>
            </polyline>
            <ConstellationStar
                v-for="node in displayedSky.nodes"
                :key="node.id"
                :node="node"
                :color="colors.get(node.constellationId) ?? '#dce6dd'"
                :selected="selectedId === node.id && canInteract(node)"
                :enabled="enabledStarIds === undefined ? undefined : nodeEnabled(node)"
                :interactive="hitTargets.has(node.id)"
                :hit-radius="hitTargets.get(node.id)"
                :style="{ '--constellation-closed-visibility': nodeVisibility(node) }"
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
            {{ tGame('game.knowledge.dragPanSkyZoomClick') }}
            <template v-if="enabledStarIds !== undefined">
                {{ tGame('game.knowledge.spaceTogglesSelectedStar') }}</template
            >
        </p>
    </FantasyBorder>
</template>

<style scoped src="./constellationGraph.css"></style>
