<script setup lang="ts">
import type { CharacterSnapshot, ClientMessage, Vector2 } from '@my-game-ratata/contracts'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { RatataGame } from '../runtime/ratataGame'
import { useEscapeOwner } from './uiEscapeOwners'
const props = defineProps<{ game: RatataGame; player: CharacterSnapshot }>()
const emit = defineEmits<{ close: []; command: [message: ClientMessage] }>()
const panel = ref<HTMLElement>()
useEscapeOwner({ active: () => true, escape: () => emit('close'), element: panel })
const directions = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
}
const direction = directions[props.player.facing]
const position = ref({
    x: Math.floor((props.player.position.x + direction.x * 32) / 16) * 16 + 8,
    y: Math.floor((props.player.position.y + direction.y * 32) / 16) * 16 + 8,
})
function point(value: Vector2): void {
    position.value = { x: Math.floor(value.x / 16) * 16 + 8, y: Math.floor(value.y / 16) * 16 + 8 }
}
function confirm(): void {
    emit('command', { type: 'plant_tree', position: { ...position.value } })
    emit('close')
}
function key(event: KeyboardEvent): void {
    if (
        !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyE', 'Enter', 'Space'].includes(
            event.code
        )
    )
        return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (event.repeat) return
    if (['KeyE', 'Enter', 'Space'].includes(event.code)) confirm()
    else {
        const next = { ...position.value }
        if (event.code === 'ArrowUp') next.y -= 16
        if (event.code === 'ArrowDown') next.y += 16
        if (event.code === 'ArrowLeft') next.x -= 16
        if (event.code === 'ArrowRight') next.x += 16
        position.value = next
    }
}
watch(position, (value) => props.game.previewPlanting(value), { immediate: true })
watch(
    () => props.player.alive,
    (alive) => {
        if (!alive) emit('close')
    }
)
onMounted(() => {
    props.game.setPlanting(point)
    props.game.previewPlanting(position.value)
    window.addEventListener('keydown', key, true)
})
onBeforeUnmount(() => {
    props.game.setPlanting()
    window.removeEventListener('keydown', key, true)
})
</script>
<template>
    <section
        ref="panel"
        class="tree-planting rpg-panel"
        data-world-pointer-owner
        role="dialog"
        aria-label="Посадка дерева"
        @keydown.stop
        @keyup.stop
    >
        <strong>Посадить дерево · 5 EN</strong>
        <p>Выберите землю мышью или стрелками. Дороги и проходы должны остаться свободными.</p>
        <button type="button" @click="confirm">Посадить · E / Enter</button>
        <button type="button" @click="emit('close')">Отмена · Esc</button>
    </section>
</template>
<style scoped>
.tree-planting {
    position: absolute;
    bottom: 110px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 20;
    padding: 12px;
    width: min(360px, 85vw);
    font: 12px system-ui;
}
button {
    margin-right: 8px;
}
</style>
