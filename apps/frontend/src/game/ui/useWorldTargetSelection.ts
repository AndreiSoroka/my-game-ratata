import type {
    CharacterControlSnapshot,
    CharacterSnapshot,
    WorldCombatTarget,
    WorldSnapshot,
} from '@my-game-ratata/contracts'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { RatataGame } from '../runtime/ratataGame'
import { relation } from './combatTargeting'
import {
    isWorldTargetEligible,
    nextWorldTarget,
    selectableWorldTargets,
    worldSelectionRange,
    type WorldSelectionTarget,
    worldTargetCandidates,
} from './worldTargetSelection'

interface SelectionProps {
    game?: RatataGame
    snapshot: WorldSnapshot
    player: CharacterSnapshot
    characters: CharacterSnapshot[]
    blocked: boolean
}
interface SelectionEffects {
    cancel: () => void
    resetGesture: () => void
    interact: (id: string) => void
}

export function useWorldTargetSelection(props: SelectionProps, effects: SelectionEffects) {
    const state = createSelectionState(props)
    const {
        selectedKey,
        selectedTarget,
        selectedId,
        selectedGraveId,
        target,
        grave,
        candidates,
        tileSize,
        visible,
        eligible,
    } = state
    function selectKey(key: string | undefined): boolean {
        if (props.blocked || !props.player.alive || props.player.cooldowns.stunMsLeft > 0)
            return false
        if (key && key !== `character:${props.player.id}`) {
            const candidate = candidates.value.find((entry) => entry.key === key)
            if (!candidate || !eligible(candidate)) return false
        }
        if (key !== selectedKey.value) effects.cancel()
        selectedKey.value = key
        return true
    }
    function select(id: string, open = false): boolean {
        const character = props.characters.find((actor) => actor.id === id)
        if (!character || character.tags.includes('offline') || !selectKey(`character:${id}`))
            return false
        if (open && !character.trainingTarget && relation(character, props.player) !== 'hostile')
            effects.interact(id)
        return true
    }
    const selectGrave = (id: string) => selectKey(`grave:${id}`)
    function cycle(reverse: boolean): void {
        const targets = selectableWorldTargets(props.snapshot, props.player, {
            characters: props.characters,
            tileSize: tileSize(),
            isVisible: visible,
        })
        selectKey(nextWorldTarget(targets, selectedKey.value, reverse))
    }
    function validateSelection(): boolean {
        if (!selectedKey.value || selectedKey.value === `character:${props.player.id}`) return true
        if (selectedTarget.value && eligible(selectedTarget.value)) return true
        const invalidKey = selectedKey.value
        selectedKey.value = undefined
        resetSelectedAction(invalidKey)
        return false
    }
    function resetSelectedAction(key: string): void {
        effects.resetGesture()
        if (targetedControlKey(props.player.control) === key) effects.cancel()
    }
    installSelectionLifecycle(props, state, validateSelection, resetSelectedAction)
    return {
        selectedKey,
        selectedTarget,
        selectedId,
        selectedGraveId,
        target,
        grave,
        selectKey,
        select,
        selectGrave,
        cycle,
        validateSelection,
    }
}

function createSelectionState(props: SelectionProps) {
    const selectedKey = ref<string>()
    const candidates = computed(() =>
        worldTargetCandidates(props.snapshot, props.player, props.characters)
    )
    const tileSize = () =>
        props.game?.selectionTileSize ?? props.snapshot.location?.map.tileWidth ?? 16
    const selectedTarget = computed<WorldSelectionTarget | undefined>(() =>
        selectedKey.value === `character:${props.player.id}`
            ? {
                  key: selectedKey.value,
                  id: props.player.id,
                  kind: 'character',
                  name: props.player.nickname,
                  position: props.player.position,
                  relationship: 'self',
              }
            : candidates.value.find((candidate) => candidate.key === selectedKey.value)
    )
    const selectedId = computed(() =>
        selectedTarget.value?.kind === 'character' ? selectedTarget.value.id : undefined
    )
    const selectedGraveId = computed(() =>
        selectedTarget.value?.kind === 'grave' ? selectedTarget.value.id : undefined
    )
    const grave = computed(() =>
        props.snapshot.graves?.find((entry) => entry.id === selectedGraveId.value)
    )
    const target = computed(() =>
        selectedId.value === props.player.id
            ? props.player
            : props.characters.find((actor) => actor.id === selectedId.value)
    )
    const visible = (candidate: WorldSelectionTarget) =>
        props.game?.isSelectionVisible?.(candidate) ?? true
    const eligible = (candidate: WorldSelectionTarget) =>
        isWorldTargetEligible(
            candidate,
            props.player,
            worldSelectionRange(props.player, tileSize()),
            visible
        )
    return {
        selectedKey,
        selectedTarget,
        selectedId,
        selectedGraveId,
        target,
        grave,
        candidates,
        tileSize,
        visible,
        eligible,
    }
}

function installSelectionLifecycle(
    props: SelectionProps,
    state: ReturnType<typeof createSelectionState>,
    validateSelection: () => boolean,
    resetSelectedAction: (key: string) => void
): void {
    const { candidates, grave, selectedTarget } = state
    watch([candidates, () => props.player], validateSelection)
    watch(
        () => grave.value?.phase,
        (phase, previous) => {
            if (previous && phase && previous !== phase && state.selectedKey.value)
                resetSelectedAction(state.selectedKey.value)
        }
    )
    watch(selectedTarget, (selected) =>
        props.game?.setCombatTarget(
            selected
                ? {
                      ...selected,
                      kind: selected.kind === 'character' ? 'character' : 'object',
                  }
                : undefined
        )
    )
    let frame = 0
    function checkViewport(): void {
        validateSelection()
        frame = requestAnimationFrame(checkViewport)
    }
    onMounted(() => {
        frame = requestAnimationFrame(checkViewport)
    })
    onBeforeUnmount(() => {
        cancelAnimationFrame(frame)
        props.game?.setCombatTarget(undefined)
    })
}

/** Selection changes must not release the independent route or held movement controls. */
function targetedControlKey(control: CharacterControlSnapshot | undefined): string | undefined {
    if (control?.mode === 'attack')
        return control.targetId ? `character:${control.targetId}` : undefined
    if (control?.mode !== 'action') return undefined
    const action = control.action
    if (!action) return control.targetId ? `character:${control.targetId}` : undefined
    if (action.kind === 'gather') return `resource:${action.nodeId}`
    if (action.kind === 'plant_tree') return undefined
    return combatAddressKey(action.kind === 'prayer' ? action.intent : action)
}

function combatAddressKey(address: {
    target?: WorldCombatTarget
    targetId?: string
}): string | undefined {
    if (address.target) return `${address.target.kind}:${address.target.id}`
    return address.targetId ? `character:${address.targetId}` : undefined
}
