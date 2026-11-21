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
import GraveDetails from './GraveDetails.vue'
import NearbyActionMenu from './NearbyActionMenu.vue'
import { nearbyInteractionTarget } from './nearbyInteractionActions'

const props = defineProps<{
    snapshot: WorldSnapshot | undefined
    player: CharacterSnapshot | undefined
    characters: CharacterSnapshot[]
    selectedId?: string
    selectedGraveId?: string
    selectedKey?: string
    canSelectTarget?: (key: string) => boolean
    blocked: boolean
    isPositionVisible?: (position: Vector2, bounds?: WorldObjectBounds, range?: number) => boolean
}>()
const emit = defineEmits<{
    command: [command: ClientMessage]
    targetChange: [target: TargetHighlight | undefined]
    selectGrave: [id: string]
}>()
const open = ref(false)
const openedKey = ref<string>()
const openedActions = ref<{ id: string; signature: string }[]>([])
const target = computed(() => {
    const candidate =
        props.snapshot && props.player
            ? nearbyInteractionTarget(
                  props.snapshot,
                  props.player,
                  props.characters,
                  props.isPositionVisible,
                  open.value
                      ? openedKey.value
                      : props.selectedKey
                        ? props.selectedKey
                        : props.selectedGraveId
                          ? `grave:${props.selectedGraveId}`
                          : props.selectedId
                            ? `character:${props.selectedId}`
                            : undefined,
                  Boolean(props.selectedKey || props.selectedId || props.selectedGraveId)
              )
            : undefined
    return candidate && props.canSelectTarget?.(candidate.key) !== false ? candidate : undefined
})
const grave = computed(() =>
    props.snapshot?.graves?.find((entry) => `grave:${entry.id}` === target.value?.key)
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
const canOpen = computed(
    () =>
        !open.value &&
        !props.blocked &&
        props.player?.alive &&
        Boolean(target.value?.actions.length)
)
const prompt = computed(() => {
    const selected = target.value
    if (!canOpen.value || !selected) return undefined
    const actionLabel =
        selected.actions.length === 1 ? selected.actions[0]?.label : 'Выбрать действие'
    const targetLabel = `F ${selected.name}`
    return actionLabel && actionLabel !== selected.name
        ? `${targetLabel} · ${actionLabel}`
        : targetLabel
})
function openMenu(): void {
    const selected = target.value
    if (!selected || !props.player || !canOpen.value) return
    if (props.canSelectTarget?.(selected.key) === false) return
    stopMovement(props.player)
    if (grave.value) emit('selectGrave', grave.value.id)
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
        props.canSelectTarget?.(openedKey.value ?? '') !== false &&
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
    [target, () => props.blocked, () => props.selectedKey],
    () => {
        const selected = !props.blocked && !props.selectedKey ? target.value : undefined
        emit(
            'targetChange',
            selected
                ? {
                      key: selected.key,
                      kind: selected.kind,
                      relationship: selected.relationship,
                      position: selected.position,
                      bounds: selected.bounds,
                      interactionAreas: selected.interactionAreas,
                  }
                : undefined
        )
    },
    { immediate: true }
)
onBeforeUnmount(() => emit('targetChange', undefined))
defineExpose({ openMenu, prompt })
</script>
<template>
    <NearbyActionMenu
        :open="open"
        :actions="actions"
        :context-label="target?.name ?? openedName"
        @select="select"
        @close="closeMenu"
    >
        <GraveDetails
            v-if="grave && snapshot"
            :grave="grave"
            :server-time="snapshot.serverTime"
            :prayer="player?.abilities?.prayers?.pray ?? player?.abilities?.prayer"
        />
    </NearbyActionMenu>
</template>
