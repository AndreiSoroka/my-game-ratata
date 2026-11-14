import type {
    AbilityClientMessage,
    AutoActionWaiting,
    CharacterAutoAction,
    CharacterControlSnapshot,
} from '@my-game-ratata/contracts'

import { handleAbilityCommand } from './abilityCommands'
import type { AbilityContext } from './abilityContext'
import { autoActionStatus, autoTargetId } from './autoActionRules'
import { autoWorldTarget } from './autoActionWorldTargets'
import type { GameCharacter } from './character'
import type { ControlWorld } from './characterControl'
import {
    advanceForestAction,
    clearForestAction,
    samePendingPlant,
    setForestAction,
    snapshotForestAction,
} from './forestAutoAction'

type CombatAction = Exclude<
    CharacterAutoAction,
    { kind: 'gather' | 'plant_tree' }
>

interface AutomaticActionState {
    action: CombatAction
    waiting: AutoActionWaiting
    lastPlanAt: number
}
const actions = new WeakMap<GameCharacter, AutomaticActionState>()
export function snapshotAutoAction(
    actor: GameCharacter
): CharacterControlSnapshot | undefined {
    const state = actions.get(actor)
    const forest = snapshotForestAction(actor)
    if (forest !== undefined) {
        return forest
    }
    return state === undefined
        ? undefined
        : {
              mode: 'action',
              targetId: autoTargetId(state.action) ?? null,
              action: structuredClone(state.action),
              waiting: state.waiting,
          }
}
export function clearAutoAction(actor: GameCharacter): boolean {
    const forest = clearForestAction(actor)
    return actions.delete(actor) || forest
}
export function setAutoAction(
    actor: GameCharacter,
    action: CharacterAutoAction,
    world: ControlWorld,
    now: number
): boolean {
    if (action.kind === 'gather' || action.kind === 'plant_tree') {
        return setForestAction(actor, action, world, now)
    }
    const context = world.abilityContextFor?.(actor, now)
    if (
        context === undefined ||
        world.publishEvents === undefined ||
        autoActionStatus(actor, action, context) === 'stop'
    ) {
        return false
    }
    actions.set(actor, {
        action: structuredClone(action),
        waiting: null,
        lastPlanAt: -Infinity,
    })
    actor.clearPath()
    actor.setMoveInput({ x: 0, y: 0 })
    return true
}
export function advanceAutoAction(
    actor: GameCharacter,
    world: ControlWorld,
    now: number
): boolean | undefined {
    const forest = advanceForestAction(actor, world, now)
    if (forest !== undefined) {
        return forest
    }
    const state = actions.get(actor)
    if (state === undefined) {
        return undefined
    }
    const context = world.abilityContextFor?.(actor, now)
    const status =
        context === undefined
            ? 'stop'
            : autoActionStatus(actor, state.action, context)
    if (status === 'stop' || context === undefined) {
        actions.delete(actor)
        actor.clearPath()
        actor.setMoveInput({ x: 0, y: 0 })
        return false
    }
    state.waiting = status === 'ready' ? null : status
    if (status === 'range') {
        approach(actor, state, world, context, now)
        return true
    }
    actor.clearPath()
    actor.setMoveInput({ x: 0, y: 0 })
    if (status !== 'ready') {
        return true
    }
    execute(actor, state.action, world, context, now)
    return true
}
function execute(
    actor: GameCharacter,
    action: CombatAction,
    world: ControlWorld,
    context: AbilityContext,
    now: number
): void {
    if (action.kind === 'attack') {
        world.requestAttack(actor, now, action.targetId, action.target)
    } else {
        const command: AbilityClientMessage =
            action.kind === 'prayer'
                ? {
                      type: 'use_ability',
                      abilityId: 'pray',
                      intent: action.intent,
                  }
                : {
                      type: 'use_ability',
                      abilityId: action.abilityId,
                      ...(action.target === undefined
                          ? {}
                          : { target: action.target }),
                      ...(action.targetId === undefined
                          ? {}
                          : { targetId: action.targetId }),
                  }
        const events = handleAbilityCommand(actor, command, context).filter(
            (event) => event.kind !== 'notice'
        )
        if (events.length === 0) {
            actions.delete(actor)
        } else {
            world.publishEvents?.(events)
        }
    }
}
function approach(
    actor: GameCharacter,
    state: AutomaticActionState,
    world: ControlWorld,
    context: AbilityContext,
    now: number
): void {
    const reference = autoWorldTarget(state.action)
    const target =
        reference === undefined
            ? world.getCharacter(autoTargetId(state.action) ?? '')
            : context.graves?.get(reference.id)
    if (target === undefined || now - state.lastPlanAt < 300) {
        return
    }
    state.lastPlanAt = now
    actor.setPath(
        context.navigation.findPathWorld(actor.position, target.position)
    )
}

export function replaceAutoAction(
    actor: GameCharacter,
    action: CharacterAutoAction | null,
    world: ControlWorld,
    now: number,
    cancel: () => void
): boolean {
    if (samePendingPlant(actor, action, world)) {
        return true
    }
    cancel()
    return action === null || setAutoAction(actor, action, world, now)
}
