<script setup lang="ts">
import type {
    CharacterSnapshot,
    ClientMessage,
    Vector2,
    WorldObjectBounds,
    WorldSnapshot,
} from '@my-game-ratata/contracts'
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue'

import type { DialogueNeighbors } from '@/entities/dialogues'
import { GraveDetails } from '@/entities/graves'
import { tGame } from '@/shared/lib/i18n'

import type { TargetHighlight } from '../../../game/runtime/interactionTargetViews'
import { focusWorldInput } from '../../../game/ui/keyboardOwnership'
import {
    type InteractionTarget,
    nearbyInteractionTarget,
} from '../../../game/ui/nearbyInteractionActions'
import { availableDialogueTargets, dialogueNeighbors } from '../model/dialogueNeighbors'
import { gameUiSoundKey } from '../model/gameUiSound'
import NearbyActionMenu from './NearbyActionMenu.vue'

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
const neighbors = computed<DialogueNeighbors>(() => {
    if (!props.snapshot || !props.player || target.value?.kind !== 'character') return {}
    return dialogueNeighbors(
        props.snapshot,
        props.player,
        props.characters,
        target.value.key,
        props.isPositionVisible,
        props.canSelectTarget
    )
})
const hasNeighbor = computed(() => Boolean(neighbors.value.left || neighbors.value.right))
const directAction = computed(() => {
    const options = target.value?.actions
    if (grave.value || options?.length !== 1 || hasNeighbor.value) return undefined
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
const readyToOpen = computed(() => !opened.value && !props.blocked && Boolean(props.player?.alive))
const canOpen = computed(() => readyToOpen.value && target.value !== undefined)
const prompt = computed(() => {
    const selected = target.value
    if (!canOpen.value || !selected) return undefined
    const targetLabel = `F ${selected.name}`
    if (grave.value && selected.actions.length === 0) return targetLabel
    const actionLabel =
        selected.actions.length === 1 && !hasNeighbor.value
            ? selected.actions[0]?.label
            : tGame('game.world.chooseAction')
    return actionLabel && actionLabel !== selected.name
        ? `${targetLabel} · ${actionLabel}`
        : targetLabel
})
function canOpenFor(key: string): boolean {
    return canOpen.value && target.value?.key === key && props.canSelectTarget?.(key) !== false
}
function forcedTarget(key?: string): InteractionTarget | undefined {
    if (!key || !props.snapshot || !props.player) return undefined
    const available = availableDialogueTargets(
        props.snapshot,
        props.player,
        props.characters,
        props.isPositionVisible,
        props.canSelectTarget
    )
    if (available.some((candidate) => candidate.key === key)) return resolveTarget(key, true)
}
function resolveMenuTarget(expectedKey: string | undefined, forceMenu: boolean) {
    if (forceMenu) return readyToOpen.value ? forcedTarget(expectedKey) : undefined
    const current = target.value
    if (current && canOpenFor(expectedKey ?? current.key)) return current
}
function directActionForMenu(forceMenu: boolean, forcedCharacter: boolean) {
    if (forcedCharacter) return undefined
    const action = directAction.value
    if (
        forceMenu &&
        action?.command.type === 'world_interact' &&
        action.command.doorAction !== undefined
    )
        return undefined
    return action
}
function openMenu(expectedKey?: string, forceMenu = false): void {
    const player = props.player
    const forcedCharacter = forceMenu && expectedKey !== undefined
    const selected = resolveMenuTarget(expectedKey, forcedCharacter)
    if (!player || !selected) return
    const explicit = selected.key === selectionKey.value
    const direct = directActionForMenu(forceMenu, forcedCharacter)
    if (!direct && !selectMenuTarget(selected, explicit)) return
    stopMovement(player)
    if (direct) {
        emit('command', direct.command)
        focusWorldInput()
        return
    }
    pinTarget(selected, player.id, explicit || forcedCharacter)
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
function switchCharacter(key: string): void {
    if (!props.player || !isCurrentTarget()) return
    if (neighbors.value.left?.key !== key && neighbors.value.right?.key !== key) return
    const selected = forcedTarget(key)
    if (!selected || props.selectTarget?.(selected.key) === false) return
    pinTarget(selected, props.player.id, true)
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
        :neighbors="neighbors"
        :details-only="grave !== undefined && actions.length === 0"
        @select="select"
        @switch-character="switchCharacter"
        @close="dismissMenu"
    >
        <GraveDetails v-if="grave && snapshot" :grave="grave" :server-time="snapshot.serverTime" />
    </NearbyActionMenu>
</template>
