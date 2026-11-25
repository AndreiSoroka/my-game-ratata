<script setup lang="ts">
import {
    type CharacterSnapshot,
    type ClientMessage,
    type MapSummary,
    type PlantTreePreview,
    TREE_PLANT_ENERGY,
    type Vector2,
} from '@my-game-ratata/contracts'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { tGame } from '@/shared/lib/i18n'

import type { RatataGame } from '../runtime/ratataGame'
import { isOwnedUiTarget, worldKeyboardOwned } from './keyboardOwnership'
import PlantingHint from './PlantingHint.vue'
import { useEscapeOwner } from './uiEscapeOwners'
const props = defineProps<{
    game: RatataGame
    player: CharacterSnapshot
    location?: { id: string; map: Pick<MapSummary, 'tileWidth' | 'tileHeight'> }
}>()
const emit = defineEmits<{ close: []; command: [message: ClientMessage] }>()
const panel = ref<HTMLElement>()
const directions = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
}
const direction = directions[props.player.facing]
const tile = {
    width: props.location?.map.tileWidth ?? 16,
    height: props.location?.map.tileHeight ?? 16,
}
const normalize = (value: Vector2) => ({
    x: Math.floor(value.x / tile.width) * tile.width + tile.width / 2,
    y: Math.floor(value.y / tile.height) * tile.height + tile.height / 2,
})
const position = ref(
    normalize({
        x: props.player.position.x + direction.x * 32,
        y: props.player.position.y + direction.y * 32,
    })
)
const preview = ref<PlantTreePreview>()
const submitted = ref(false)
const reason = ref('')
const anchor = ref({ x: 0, y: 0, width: 320, height: 480 })
const locationId = props.location?.id
const saplings = () =>
    props.player.inventory
        .filter((item) => item.itemId === 'sapling')
        .reduce((sum, item) => sum + (item.quantity ?? 1), 0)
const initialCount = saplings()
let sequence = 0,
    expected = '',
    lastRequest = -Infinity,
    seenApproach = false
let timer: ReturnType<typeof setTimeout> | undefined
let submissionTimer: ReturnType<typeof setTimeout> | undefined
let unsubscribe: (() => void) | undefined
let frame = 0
let disposed = false
let pointerChosen = false
const available = computed(() => preview.value?.available === true)
const energyCost = computed(() => props.player.resourceChecks?.plantEnergyCost ?? TREE_PLANT_ENERGY)
const status = computed(() =>
    submitted.value
        ? tGame('game.world.approachingPlot')
        : reason.value ||
          preview.value?.reason ||
          (preview.value
              ? tGame('game.world.clearPlot', { energy: String(energyCost.value) })
              : tGame('game.world.checkingPlot'))
)
function request(attempt = 0): void {
    clearTimeout(timer)
    expected = ''
    preview.value = undefined
    reason.value = ''
    props.game.planting.preview(position.value, false)
    const send = () => {
        if (disposed || submitted.value) return
        lastRequest = performance.now()
        expected = `plant-${Date.now()}-${++sequence}`
        emit('command', {
            type: 'plant_tree_preview',
            requestId: expected,
            position: { ...position.value },
        })
        timer = setTimeout(() => {
            if (preview.value || submitted.value || disposed) return
            if (attempt < 2) request(attempt + 1)
            else reason.value = tGame('game.world.plotRequestTimedOut')
        }, 1100)
    }
    const delay = Math.max(0, 110 - (performance.now() - lastRequest))
    if (delay === 0) send()
    else timer = setTimeout(send, delay)
}
function receive(answer: PlantTreePreview): void {
    if (submitted.value || answer.requestId !== expected || answer.locationId !== locationId) return
    clearTimeout(timer)
    preview.value = answer
    props.game.planting.preview(answer.position, answer.available, answer.bounds)
}
function choose(value: Vector2): void {
    if (submitted.value) return
    const next = normalize(value)
    if (next.x === position.value.x && next.y === position.value.y) return
    position.value = next
    request()
}
function point(value: Vector2): void {
    const next = normalize(value)
    if (pointerChosen && next.x === position.value.x && next.y === position.value.y) confirm()
    else {
        pointerChosen = true
        choose(next)
    }
}
function confirm(): void {
    if (submitted.value) return
    if (!available.value) {
        reason.value = preview.value?.reason ?? tGame('game.world.waitingForPlotCheck')
        return
    }
    if (saplings() === 0) {
        reason.value = tGame('game.world.noSaplings')
        return
    }
    submitted.value = true
    submissionTimer = setTimeout(() => {
        submissionTimer = undefined
        if (!disposed && props.player.control?.action?.kind !== 'plant_tree') closePanel()
    }, 500)
    props.game.planting.set()
    emit('command', {
        type: 'auto_action',
        action: { kind: 'plant_tree', position: { ...preview.value!.position } },
    })
    // Keep the footprint and hint visible while the ordinary server route executes.
    props.game.planting.preview(preview.value!.position, true, preview.value!.bounds)
    document.querySelector<HTMLCanvasElement>('[data-game-canvas]')?.focus()
}
function cancel(): void {
    if (submitted.value) emit('command', { type: 'cancel_control' })
    closePanel()
}
function closePanel(): void {
    clearTimeout(submissionTimer)
    submissionTimer = undefined
    emit('close')
}
useEscapeOwner({ active: () => true, escape: cancel, element: panel })
function key(event: KeyboardEvent): void {
    if (worldKeyboardOwned() || isOwnedUiTarget(event.target)) return
    if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) {
        cancel()
        return
    }
    if (
        submitted.value ||
        !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyF', 'Enter', 'Space'].includes(
            event.code
        )
    )
        return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (event.repeat) return
    const arrows: Record<string, Vector2> = {
        ArrowLeft: { x: -tile.width, y: 0 },
        ArrowRight: { x: tile.width, y: 0 },
        ArrowUp: { x: 0, y: -tile.height },
        ArrowDown: { x: 0, y: tile.height },
    }
    const step = arrows[event.code]
    if (step) choose({ x: position.value.x + step.x, y: position.value.y + step.y })
    else confirm()
}
watch([() => props.player, () => props.location?.id], () => {
    if (!props.player.alive || props.location?.id !== locationId) {
        closePanel()
        return
    }
    if (!submitted.value) return
    if (props.player.control?.action?.kind === 'plant_tree') seenApproach = true
    else if (seenApproach || saplings() < initialCount) closePanel()
})
function project(): void {
    if (disposed) return
    anchor.value = props.game.projectPosition(position.value) ?? anchor.value
    frame = requestAnimationFrame(project)
}
onMounted(() => {
    unsubscribe = props.game.planting.subscribe(receive)
    props.game.planting.set(point, (value) => {
        pointerChosen = true
        choose(value)
    })
    request()
    project()
    window.addEventListener('keydown', key, true)
})
onBeforeUnmount(() => {
    disposed = true
    clearTimeout(timer)
    clearTimeout(submissionTimer)
    cancelAnimationFrame(frame)
    unsubscribe?.()
    props.game.planting.set()
    window.removeEventListener('keydown', key, true)
})
</script>
<template>
    <div ref="panel">
        <PlantingHint
            :anchor="anchor"
            :available="available"
            :approaching="submitted"
            :status="status"
            @confirm="confirm"
            @cancel="cancel"
        />
    </div>
</template>
