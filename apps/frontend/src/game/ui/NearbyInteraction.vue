<script setup lang="ts">
import type {
    CharacterSnapshot,
    ClientMessage,
    Vector2,
    WorldObjectBounds,
    WorldSnapshot,
} from '@my-game-ratata/contracts'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import type { TargetHighlight } from '../runtime/interactionTargetViews'
import NearbyActionMenu from './NearbyActionMenu.vue'
import { nearbyInteractionTarget } from './nearbyInteractionActions'

const props = defineProps<{
    snapshot: WorldSnapshot | undefined
    player: CharacterSnapshot | undefined
    characters: CharacterSnapshot[]
    selectedId?: string
    blocked: boolean
    isPositionVisible?: (position: Vector2, bounds?: WorldObjectBounds, range?: number) => boolean
}>()
const emit = defineEmits<{
    command: [command: ClientMessage]
    requestOpen: []
    targetChange: [target: TargetHighlight | undefined]
}>()
const open = ref(false)
const openedKey = ref<string>()
const openedActions = ref<{ id: string; signature: string }[]>([])
const target = computed(() =>
    props.snapshot && props.player
        ? nearbyInteractionTarget(
              props.snapshot,
              props.player,
              props.characters,
              props.isPositionVisible,
              open.value
                  ? openedKey.value
                  : props.selectedId
                    ? `character:${props.selectedId}`
                    : undefined,
              Boolean(props.selectedId)
          )
        : undefined
)
const actions = computed(() =>
    open.value
        ? openedActions.value.flatMap(
              (entry) => target.value?.actions.filter((action) => action.id === entry.id) ?? []
          )
        : (target.value?.actions ?? [])
)
let openedLocation: string | undefined
let openedName = ''
function closeMenu(): void {
    open.value = false
    openedKey.value = undefined
    openedActions.value = []
}
function stopMovement(player: CharacterSnapshot): void {
    if (player.path.length > 0) emit('command', { type: 'move_to', target: { ...player.position } })
    emit('command', { type: 'move_input', axis: { x: 0, y: 0 } })
}
function openMenu(): void {
    const selected = target.value
    if (open.value || props.blocked || !props.player?.alive || !selected?.actions.length) return
    stopMovement(props.player)
    if (selected.actions.length === 1 && !selected.actions[0]!.disabled) {
        emit('command', selected.actions[0]!.command)
        document.querySelector<HTMLCanvasElement>('[data-game-canvas]')?.focus()
        return
    }
    openedLocation = props.snapshot?.location?.id
    openedKey.value = selected.key
    openedName = selected.name
    openedActions.value = selected.actions.map((action) => ({
        id: action.id,
        signature: JSON.stringify(action.command),
    }))
    open.value = true
}
function isCurrentTarget(): boolean {
    return (
        !props.blocked &&
        Boolean(props.player?.alive) &&
        props.snapshot?.location?.id === openedLocation &&
        target.value?.key === openedKey.value
    )
}
function select(id: string): void {
    if (!open.value) return
    const action = actions.value.find((entry) => entry.id === id)
    const original = openedActions.value.find((entry) => entry.id === id)
    if (!isCurrentTarget() || !action || JSON.stringify(action.command) !== original?.signature) {
        closeMenu()
        return
    }
    if (action.disabled) return
    closeMenu()
    emit('command', action.command)
}
watch(
    [() => props.snapshot?.location?.id, () => props.player?.alive, () => props.blocked, target],
    () => {
        if (!open.value) return
        const changedAction = openedActions.value.some(
            (entry) =>
                !target.value?.actions.some(
                    (action) =>
                        action.id === entry.id && JSON.stringify(action.command) === entry.signature
                )
        )
        if (!isCurrentTarget() || changedAction) closeMenu()
    }
)
watch(
    [target, () => props.blocked],
    () => {
        const selected = !props.blocked ? target.value : undefined
        emit(
            'targetChange',
            selected
                ? {
                      key: selected.key,
                      kind: selected.kind,
                      relationship: selected.relationship,
                      position: selected.position,
                      bounds: selected.bounds,
                  }
                : undefined
        )
    },
    { immediate: true }
)
onBeforeUnmount(() => emit('targetChange', undefined))
defineExpose({ openMenu })
</script>
<template>
    <button
        v-if="target && actions.length && !blocked && !open"
        class="nearby-prompt"
        type="button"
        @click="emit('requestOpen')"
    >
        <kbd>E</kbd> <strong>{{ target.name }}</strong>
        <span
            v-if="actions.length !== 1 || actions[0]?.label !== target.name"
            class="nearby-prompt__action"
            >{{ actions.length === 1 ? actions[0]?.label : 'Выбрать действие' }}</span
        >
    </button>
    <NearbyActionMenu
        :open="open"
        :actions="actions"
        :context-label="target?.name ?? openedName"
        @select="select"
        @close="closeMenu"
    />
</template>
<style scoped>
.nearby-prompt {
    position: absolute;
    z-index: 6;
    left: 16px;
    bottom: 16px;
    padding: 10px 13px;
    max-width: calc(100% - 32px);
    text-align: left;
    background: #18241bea;
    color: #ebd6a5;
    border: 1px solid #99885b;
    border-radius: 4px;
    font:
        12px/1.5 system-ui,
        sans-serif;
    cursor: pointer;
}
.nearby-prompt strong {
    margin-left: 0.4rem;
    font-weight: 600;
}
.nearby-prompt__action {
    display: block;
    color: #bcc8b4;
    font-size: 0.9em;
}
.nearby-prompt kbd {
    border: 1px solid #8c9478;
    padding: 1px 4px;
    border-radius: 2px;
    font: inherit;
}
@media (max-width: 740px) {
    .nearby-prompt {
        left: 12px;
        bottom: 114px;
        padding: 7px 10px;
        font-size: 11px;
    }
}
</style>
