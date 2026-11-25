import type { CharacterAutoAction, CharacterSnapshot } from '@my-game-ratata/contracts'
import { reactive } from 'vue'

import type { HotbarEmit, HotbarProps } from './hotbarActions'
import { bindingMatchesAction, type HotbarBinding } from './hotbarBindings'

const repeatWindowMs = 300

interface GestureState {
    previous?: { index: number; at: number; action: CharacterAutoAction }
    optimistic?: CharacterAutoAction
    acquiredTargetId?: string
    pendingAttack?: { targetId: string; combatId: string | undefined }
    activeIndex?: number
    lastFood?: { index: number; at: number }
    suppressServer: boolean
}
export function createGestures(
    props: HotbarProps,
    emit: HotbarEmit,
    bindings: () => (HotbarBinding | null)[]
) {
    const state = reactive<GestureState>({ suppressServer: false })
    const reset = () => {
        state.previous = undefined
        state.optimistic = undefined
        state.acquiredTargetId = undefined
        state.pendingAttack = undefined
        state.activeIndex = undefined
        state.lastFood = undefined
        state.suppressServer = true
    }
    const serverRepeat = () => {
        const serverAction = props.player.control?.action
        return serverAction?.kind === 'attack' && serverAction.once === true
            ? undefined
            : serverAction
    }
    const action = () => state.optimistic ?? (state.suppressServer ? undefined : serverRepeat())
    const activeIndex = () =>
        state.activeIndex ??
        bindings().findIndex((binding) => bindingMatchesAction(binding, action()))
    return {
        reset,
        acknowledge: () => acknowledge(state, props.player, serverRepeat()),
        syncTarget(targetId: string | undefined): void {
            if (targetId !== undefined && targetId === state.acquiredTargetId) {
                state.acquiredTargetId = undefined
                return
            }
            reset()
        },
        hasPendingAttack: (targetId: string) => hasPendingAttack(state, props.player, targetId),
        markAttackPending: (targetId: string) => {
            state.pendingAttack = { targetId, combatId: props.player.combat?.action?.id }
        },
        active: (index: number, binding: HotbarBinding | null) =>
            index === activeIndex() && bindingMatchesAction(binding, action()),
        rememberFood: (index: number) => {
            state.lastFood = { index, at: performance.now() }
        },
        consumeFood: (index: number): boolean => {
            const now = performance.now()
            if (state.lastFood?.index === index && now - state.lastFood.at <= repeatWindowMs)
                return false
            reset()
            return true
        },
        remember: (index: number, next: CharacterAutoAction, acquiredTargetId?: string) => {
            state.previous = { index, at: performance.now(), action: next }
            if (acquiredTargetId !== undefined) state.acquiredTargetId = acquiredTargetId
        },
        repeat(index: number, binding: HotbarBinding): boolean {
            if (action() !== undefined) {
                const sameSlot = index === activeIndex()
                emit('command', { type: 'auto_action', action: null })
                reset()
                return sameSlot
            }
            const previous = state.previous
            if (
                previous?.index !== index ||
                performance.now() - previous.at > repeatWindowMs ||
                binding.kind === 'item'
            )
                return false
            state.optimistic = previous.action
            state.activeIndex = index
            state.suppressServer = false
            emit('command', { type: 'auto_action', action: plainAction(previous.action) })
            state.previous = undefined
            return true
        },
    }
}
function attacksTarget(action: CharacterAutoAction | undefined, targetId: string): boolean {
    return action?.kind === 'attack' && action.targetId === targetId
}
function hasPendingAttack(
    state: GestureState,
    player: CharacterSnapshot,
    targetId: string
): boolean {
    const mode = player.control?.mode
    return (
        attacksTarget(state.optimistic, targetId) ||
        (state.pendingAttack?.targetId === targetId && mode !== 'route' && mode !== 'follow')
    )
}
function acknowledge(
    state: GestureState,
    player: CharacterSnapshot,
    repeat: CharacterAutoAction | undefined
): void {
    const pending = state.pendingAttack
    const combatId = player.combat?.action?.id
    if (
        pending &&
        (attacksTarget(player.control?.action, pending.targetId) ||
            (combatId !== undefined && combatId !== pending.combatId))
    )
        state.pendingAttack = undefined
    if (JSON.stringify(repeat) === JSON.stringify(state.optimistic)) state.optimistic = undefined
    if (repeat === undefined && state.optimistic === undefined) {
        state.activeIndex = undefined
        state.suppressServer = false
    }
}
/** Vue wraps local gesture state; commands stay plain serializable messages. */
function plainAction(action: CharacterAutoAction): CharacterAutoAction {
    if (action.kind === 'prayer')
        return {
            kind: 'prayer',
            abilityId: action.abilityId ?? 'pray',
            intent: { ...action.intent },
        }
    return { ...action }
}
