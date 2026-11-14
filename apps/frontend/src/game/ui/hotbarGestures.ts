import type { CharacterAutoAction } from '@my-game-ratata/contracts'
import { reactive } from 'vue'

import type { HotbarEmit, HotbarProps } from './hotbarActions'
import { bindingMatchesAction, type HotbarBinding } from './hotbarBindings'

interface GestureState {
    previous?: { index: number; at: number; action: CharacterAutoAction }
    optimistic?: CharacterAutoAction
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
        state.activeIndex = undefined
        state.lastFood = undefined
        state.suppressServer = true
    }
    const action = () =>
        state.optimistic ?? (state.suppressServer ? undefined : props.player.control?.action)
    const activeIndex = () =>
        state.activeIndex ??
        bindings().findIndex((binding) => bindingMatchesAction(binding, action()))
    return {
        reset,
        acknowledge: () => acknowledge(state, props.player.control?.action),
        active: (index: number, binding: HotbarBinding | null) =>
            index === activeIndex() && bindingMatchesAction(binding, action()),
        rememberFood: (index: number) => {
            state.lastFood = { index, at: performance.now() }
        },
        consumeFood: (index: number): boolean => {
            const now = performance.now()
            if (state.lastFood?.index === index && now - state.lastFood.at <= 300) return false
            reset()
            return true
        },
        remember: (index: number, next: CharacterAutoAction) => {
            state.previous = { index, at: performance.now(), action: next }
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
                performance.now() - previous.at > 300 ||
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
function acknowledge(state: GestureState, action: CharacterAutoAction | undefined): void {
    if (JSON.stringify(action) === JSON.stringify(state.optimistic)) state.optimistic = undefined
    if (action === undefined && state.optimistic === undefined) {
        state.activeIndex = undefined
        state.suppressServer = false
    }
}
/** Vue wraps local gesture state; commands stay plain serializable messages. */
function plainAction(action: CharacterAutoAction): CharacterAutoAction {
    if (action.kind === 'prayer') return { kind: 'prayer', intent: { ...action.intent } }
    return { ...action }
}
