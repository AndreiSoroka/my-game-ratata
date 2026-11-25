import type {
    CharacterControlSnapshot,
    CharacterSnapshot,
    WorldCombatTarget,
    WorldSnapshot,
} from '@my-game-ratata/contracts'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { RatataGame } from '../../../game/runtime/ratataGame'
import { attackableTarget, relation } from '../../../game/ui/combatTargeting'
import {
    isWorldTargetEligible,
    nextWorldTarget,
    selectableWorldTargets,
    worldSelectionRange,
    type WorldSelectionTarget,
    worldTargetCandidates,
    type WorldTargetVisibility,
} from '../../../game/ui/worldTargetSelection'

interface SelectionProps {
    game?: RatataGame
    snapshot: WorldSnapshot
    player: CharacterSnapshot
    characters: CharacterSnapshot[]
    blocked: boolean
    nearbyTargetKey?: string
}
interface SelectionEffects {
    cancel: () => void
    resetGesture: () => void
    hasPendingAttack: (targetKey: string) => boolean
    interact: (id: string) => void
}

export function useWorldTargetSelection(props: SelectionProps, effects: SelectionEffects) {
    const state = createSelectionState(props)
    const { selectedKey, selectedTarget, candidates, tileSize, visible, eligible } = state
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
    function selectSelf(): void {
        const previous = selectedKey.value
        const self = `character:${props.player.id}`
        selectedKey.value = previous === self ? undefined : self
        if (previous && previous !== self) resetSelectedAction(previous)
        else effects.resetGesture()
    }
    function acquireAttackTarget(): string | undefined {
        if (selectedKey.value !== undefined || state.focusedTarget.value) return undefined
        const nearest = nearestAttackTarget(props, tileSize(), visible)
        return nearest && selectKey(nearest.key) ? nearest.id : undefined
    }
    function cycle(group: 'hostile' | 'non-hostile', reverse: boolean): void {
        const targets = selectableWorldTargets(props.snapshot, props.player, {
            characters: props.characters,
            tileSize: tileSize(),
            isVisible: visible,
        }).filter((target) => {
            const hostile = target.kind === 'character' && target.relationship === 'hostile'
            return hostile === (group === 'hostile')
        })
        const next = nextWorldTarget(targets, selectedKey.value, reverse)
        if (next !== undefined) selectKey(next)
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
        if (effects.hasPendingAttack(key) || targetedControlKey(props.player.control) === key)
            effects.cancel()
        else effects.resetGesture()
    }
    installSelectionLifecycle(props, state, validateSelection, resetSelectedAction)
    return {
        selectedKey,
        focusedTarget: state.focusedTarget,
        selectedId: state.selectedId,
        selectedGraveId: state.selectedGraveId,
        target: state.target,
        grave: state.grave,
        selectKey,
        select,
        selectGrave,
        selectSelf,
        acquireAttackTarget,
        cycle,
        validateSelection,
    }
}

function nearestAttackTarget(
    props: SelectionProps,
    tileSize: number,
    visible: WorldTargetVisibility
) {
    return selectableWorldTargets(props.snapshot, props.player, {
        characters: props.characters.filter(
            (actor) => actor.alive && !actor.life?.retired && attackableTarget(actor, props.player)
        ),
        tileSize,
        isVisible: (candidate) =>
            candidate.kind === 'character' &&
            visible(candidate) &&
            props.game?.isInteractionVisible?.(candidate.position, undefined, Infinity) === true,
    })[0]
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
    const visible = (candidate: WorldSelectionTarget) =>
        props.game?.isSelectionVisible?.(candidate) ?? true
    const eligible = (candidate: WorldSelectionTarget) =>
        isWorldTargetEligible(
            candidate,
            props.player,
            worldSelectionRange(props.player, tileSize()),
            visible
        )
    const focusedTarget = computed(() => {
        if (selectedKey.value !== undefined) return selectedTarget.value
        if (props.blocked || !props.player.alive || props.player.cooldowns.stunMsLeft > 0)
            return undefined
        const candidate = candidates.value.find(({ key }) => key === props.nearbyTargetKey)
        return candidate && eligible(candidate) ? candidate : undefined
    })
    const grave = computed(() =>
        focusedTarget.value?.kind === 'grave'
            ? props.snapshot.graves?.find((entry) => entry.id === focusedTarget.value?.id)
            : undefined
    )
    const target = computed(() => {
        const focus = focusedTarget.value
        if (focus?.kind !== 'character') return undefined
        return focus.relationship === 'self'
            ? props.player
            : props.characters.find((actor) => actor.id === focus.id)
    })
    return {
        selectedKey,
        selectedTarget,
        focusedTarget,
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
    const { candidates, grave, focusedTarget, selectedKey } = state
    watch([candidates, () => props.player], validateSelection)
    watch([() => focusedTarget.value?.key, selectedKey], ([key, pinned], [previous, wasPinned]) => {
        if (!pinned && !wasPinned && previous && previous !== key) resetSelectedAction(previous)
    })
    watch(
        [() => grave.value?.id, () => grave.value?.phase],
        ([id, phase], [previousId, previousPhase]) => {
            if (id && id === previousId && previousPhase && phase !== previousPhase)
                resetSelectedAction(`grave:${id}`)
        }
    )
    watch(
        focusedTarget,
        (selected) => {
            if (!selected) {
                props.game?.setCombatTarget(undefined)
                return
            }
            const { name, ...target } = selected
            const character = target.kind === 'character'
            // Other characters already have a world nameplate. The local player has none by default.
            props.game?.setCombatTarget({
                ...target,
                kind: character ? 'character' : 'object',
                ...(!character || target.relationship === 'self' ? { name } : {}),
            })
        },
        { immediate: true }
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
