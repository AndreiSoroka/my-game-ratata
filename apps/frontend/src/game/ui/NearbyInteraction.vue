<script setup lang="ts">
import type {
    CharacterSnapshot,
    ClientMessage,
    Vector2,
    WorldObjectBounds,
    WorldSnapshot,
} from '@my-game-ratata/contracts'
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue'

import { tGame } from '@/shared/lib/i18n'

import type { TargetHighlight } from '../runtime/interactionTargetViews'
import { gameUiSoundKey } from './gameUiSound'
import GraveDetails from './GraveDetails.vue'
import NearbyActionMenu from './NearbyActionMenu.vue'
import {
    type InteractionTarget,
    nearbyCharacterInteractionTargets,
    nearbyInteractionTarget,
} from './nearbyInteractionActions'
import { nextWorldTarget } from './worldTargetSelection'

const props = defineProps<{
    snapshot: WorldSnapshot | undefined
    player: CharacterSnapshot | undefined
    characters: CharacterSnapshot[]
    selectedId?: string
    selectedGraveId?: string
    selectedKey?: string
    canSelectTarget?: (key: string) => boolean
    selectTarget?: (key: string) => boolean
    blocked: boolean
    isPositionVisible?: (position: Vector2, bounds?: WorldObjectBounds, range?: number) => boolean
}>()
const emit = defineEmits<{
    command: [command: ClientMessage]
    targetChange: [target: TargetHighlight | undefined]
    selectGrave: [id: string]
}>()
const playUiSound = inject(gameUiSoundKey)
const opened = ref<{
    key: string
    name: string
    playerId: string
    locationId?: string
    ignoreFacing: boolean
    actions: { id: string; signature: string }[]
}>()
const selectionKey = computed(
    () =>
        props.selectedKey ??
        (props.selectedGraveId
            ? `grave:${props.selectedGraveId}`
            : props.selectedId
              ? `character:${props.selectedId}`
              : undefined)
)
function resolveTarget(key?: string, ignoreFacing = false): InteractionTarget | undefined {
    if (!props.snapshot || !props.player) return undefined
    return nearbyInteractionTarget(
        props.snapshot,
        props.player,
        props.characters,
        props.isPositionVisible,
        key,
        ignoreFacing,
        props.canSelectTarget
    )
}
const target = computed(() => {
    const menu = opened.value
    return menu
        ? resolveTarget(menu.key, menu.ignoreFacing)
        : resolveTarget(selectionKey.value, Boolean(selectionKey.value))
})
const grave = computed(() =>
    props.snapshot?.graves?.find((entry) => `grave:${entry.id}` === target.value?.key)
)
const actions = computed(() =>
    opened.value
        ? opened.value.actions.flatMap(
              (entry) => target.value?.actions.filter((action) => action.id === entry.id) ?? []
          )
        : (target.value?.actions ?? [])
)
const alternateCharacters = computed(() => {
    if (!props.snapshot || !props.player || target.value?.kind !== 'character') return []
    return nearbyCharacterInteractionTargets(
        props.snapshot,
        props.player,
        props.characters,
        props.isPositionVisible,
        props.canSelectTarget
    ).filter((candidate) => candidate.key !== target.value?.key)
})
const directAction = computed(() => {
    const options = target.value?.actions
    if (options?.length !== 1 || alternateCharacters.value.length > 0) return undefined
    const action = options[0]
    return action && !action.disabled && action.command.type !== 'set_personal_hostility'
        ? action
        : undefined
})
function closeMenu(): void {
    opened.value = undefined
}
function dismissMenu(): void {
    if (!opened.value) return
    closeMenu()
    playUiSound?.('uiClose')
}
function stopMovement(player: CharacterSnapshot): void {
    if (player.control && player.control.mode !== 'none')
        emit('command', { type: 'cancel_control' })
    else if (player.path.length > 0)
        emit('command', { type: 'move_to', target: { ...player.position } })
    emit('command', { type: 'move_input', axis: { x: 0, y: 0 } })
}
const canOpen = computed(
    () =>
        !opened.value &&
        !props.blocked &&
        Boolean(props.player?.alive) &&
        Boolean(target.value?.actions.length)
)
const prompt = computed(() => {
    const selected = target.value
    if (!canOpen.value || !selected) return undefined
    const actionLabel =
        selected.actions.length === 1 && alternateCharacters.value.length === 0
            ? selected.actions[0]?.label
            : tGame('game.world.chooseAction')
    const targetLabel = `F ${selected.name}`
    return actionLabel && actionLabel !== selected.name
        ? `${targetLabel} · ${actionLabel}`
        : targetLabel
})
function canOpenFor(key: string): boolean {
    return canOpen.value && target.value?.key === key && props.canSelectTarget?.(key) !== false
}
function openMenu(expectedKey?: string): void {
    const selected = target.value
    if (!selected || !props.player || !canOpenFor(expectedKey ?? selected.key)) return
    const explicit = selected.key === selectionKey.value
    const direct = directAction.value
    if (!direct && !selectMenuTarget(selected, explicit)) return
    stopMovement(props.player)
    if (grave.value) emit('selectGrave', grave.value.id)
    if (direct) {
        emit('command', direct.command)
        document.querySelector<HTMLCanvasElement>('[data-game-canvas]')?.focus()
        return
    }
    pinTarget(selected, props.player.id, explicit)
    playUiSound?.('uiOpen')
}
function selectMenuTarget(target: InteractionTarget, explicit: boolean): boolean {
    return explicit || target.kind !== 'character' || props.selectTarget?.(target.key) !== false
}
function pinTarget(target: InteractionTarget, playerId: string, ignoreFacing: boolean): void {
    opened.value = {
        key: target.key,
        name: target.name,
        playerId,
        locationId: props.snapshot?.location?.id,
        ignoreFacing,
        actions: target.actions.map((action) => ({
            id: action.id,
            signature: JSON.stringify(action.command),
        })),
    }
}
function switchCharacter(reverse: boolean): void {
    const current = target.value
    const player = props.player
    if (current?.kind !== 'character' || !player || !isCurrentTarget()) return
    const ordered = [...alternateCharacters.value, current].sort(
        (a, b) =>
            a.position.x - b.position.x || a.position.y - b.position.y || a.key.localeCompare(b.key)
    )
    const next = nextWorldTarget(ordered, current.key, reverse)
    if (!next || next === current.key) return
    const selected = resolveTarget(next, true)
    if (!selected || props.selectTarget?.(selected.key) === false) return
    pinTarget(selected, player.id, true)
    playUiSound?.('uiSelect')
}
function isCurrentTarget(): boolean {
    const menu = opened.value
    return (
        menu !== undefined &&
        !props.blocked &&
        props.player?.alive === true &&
        props.player.id === menu.playerId &&
        props.snapshot?.location?.id === menu.locationId &&
        props.canSelectTarget?.(menu.key) !== false &&
        target.value?.key === menu.key
    )
}
function select(id: string): void {
    if (!opened.value) return
    const action = actions.value.find((entry) => entry.id === id)
    const original = opened.value.actions.find((entry) => entry.id === id)
    if (!isCurrentTarget() || !action || JSON.stringify(action.command) !== original?.signature) {
        closeMenu()
        return
    }
    if (action.disabled) return
    closeMenu()
    playUiSound?.('uiClick')
    emit('command', action.command)
}
watch(
    [
        () => props.snapshot?.location?.id,
        () => props.player?.id,
        () => props.player?.alive,
        () => props.blocked,
        target,
    ],
    () => {
        if (!opened.value) return
        const changedAction = opened.value.actions.some(
            (entry) =>
                !target.value?.actions.some(
                    (action) =>
                        action.id === entry.id && JSON.stringify(action.command) === entry.signature
                )
        )
        if (!isCurrentTarget() || changedAction) closeMenu()
    }
)
watch(selectionKey, (key) => {
    const openedKey = opened.value?.key
    if (openedKey?.startsWith('character:') && openedKey !== key) closeMenu()
})
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
defineExpose({ canOpenFor, openMenu, prompt })
</script>
<template>
    <NearbyActionMenu
        :open="Boolean(opened)"
        :actions="actions"
        :context-label="target?.name ?? opened?.name"
        :target-key="opened?.key"
        :can-switch-character="alternateCharacters.length > 0"
        @select="select"
        @switch-character="switchCharacter"
        @close="dismissMenu"
    >
        <GraveDetails
            v-if="grave && snapshot"
            :grave="grave"
            :server-time="snapshot.serverTime"
            :prayer="player?.abilities?.prayers?.pray ?? player?.abilities?.prayer"
        />
    </NearbyActionMenu>
</template>
