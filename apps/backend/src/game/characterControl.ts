import type {
    CharacterControlCommand,
    CharacterControlSnapshot,
    Vector2,
} from '@my-game-ratata/contracts'

import {
    allowedMode,
    availableActor as available,
    reachedTarget,
    visibleTarget,
} from './autoActionTargets'
import { prepareComboTarget } from './bladeCombo'
import type { GameCharacter } from './character'
import {
    advanceAutoAction,
    clearAutoAction,
    replaceAutoAction,
    snapshotAutoAction,
} from './characterAutoAction'
import {
    advanceCharacterRoute,
    clearCharacterRoute,
    snapshotCharacterRoute,
} from './characterRoute'
import type { ControlWorld } from './controlWorld'
import { findActorPath } from './doorNavigation'
import { distance } from './math'
import type { NavigationService } from './navigation'

interface ControlState extends CharacterControlSnapshot {
    lastKnown: Vector2
    lastSeenAt: number
    lastPlanAt: number
    locationId: string
    crossing?: {
        from: string
        to: string
        edge: Vector2
        direction: Vector2
        expiresAt: number
    }
}
export type { ControlWorld } from './controlWorld'
const controls = new WeakMap<GameCharacter, ControlState>()
const sightRange = 240

export function snapshotControl(
    actor: GameCharacter
): CharacterControlSnapshot {
    const state = controls.get(actor)
    return (
        snapshotCharacterRoute(actor) ??
        snapshotAutoAction(actor) ?? {
            mode: state?.mode ?? 'none',
            targetId: state?.targetId ?? null,
        }
    )
}
export function cancelCharacterControl(actor: GameCharacter): void {
    const automatic = clearAutoAction(actor)
    const route = clearCharacterRoute(actor)
    if (!controls.delete(actor) && !automatic && !route) {
        return
    }
    actor.clearPath()
    actor.setMoveInput({ x: 0, y: 0 })
}
export { parseControlCommand } from './controlCommands'
export function setCharacterControl(
    actor: GameCharacter,
    command: CharacterControlCommand,
    world: ControlWorld,
    now: number
): boolean {
    if (command.type === 'auto_action') {
        return replaceAutoAction(actor, command.action, world, now, () =>
            cancelCharacterControl(actor)
        )
    }
    if (command.type === 'cancel_control' || command.targetId === null) {
        cancelCharacterControl(actor)
        return true
    }
    return setTargetControl(
        actor,
        { ...command, targetId: command.targetId },
        world,
        now
    )
}
function setTargetControl(
    actor: GameCharacter,
    command: Exclude<
        CharacterControlCommand,
        { type: 'auto_action' } | { type: 'cancel_control' }
    > & { targetId: string },
    world: ControlWorld,
    now: number
): boolean {
    const target = world.getCharacter(command.targetId)
    const navigation = world.navigationFor(actor)
    if (
        !available(actor, now) ||
        target === undefined ||
        !available(target) ||
        actor.id === target.id ||
        !visibleTarget(actor, target, { navigation, now })
    ) {
        return false
    }
    if (
        !allowedMode(
            actor,
            target,
            command.type === 'auto_attack' ? 'attack' : 'follow',
            now
        )
    ) {
        return false
    }
    if (command.type === 'auto_attack') {
        prepareComboTarget(actor, command.targetId)
    }
    cancelCharacterControl(actor)
    actor.clearPath()
    actor.setMoveInput({ x: 0, y: 0 })
    controls.set(actor, {
        mode: command.type === 'auto_attack' ? 'attack' : 'follow',
        targetId: target.id,
        lastKnown: { ...target.position },
        lastSeenAt: now,
        lastPlanAt: -Infinity,
        locationId: actor.locationId,
    })
    return true
}

/** All controllers share this intention policy; it never sets position or damage. */
export function advanceCharacterControl(
    actor: GameCharacter,
    world: ControlWorld,
    now: number
): boolean {
    const route = advanceCharacterRoute(actor, world, now)
    if (route !== undefined) {
        return route
    }
    const automatic = advanceAutoAction(actor, world, now)
    if (automatic !== undefined) {
        return automatic
    }
    return advanceTargetControl(actor, world, now)
}
function advanceTargetControl(
    actor: GameCharacter,
    world: ControlWorld,
    now: number
): boolean {
    const state = controls.get(actor)
    if (state === undefined || state.targetId === null) {
        return false
    }
    const target = world.getCharacter(state.targetId)
    if (
        !available(actor, now) ||
        target === undefined ||
        !available(target) ||
        !allowedMode(actor, target, state.mode, now)
    ) {
        cancelCharacterControl(actor)
        return false
    }
    if (actor.isActionLocked(now)) {
        return true
    }
    const navigation = world.navigationFor(actor)
    if (target.locationId !== actor.locationId) {
        return crossKnownExit(actor, state, navigation, now)
    }
    delete state.crossing
    if (!visibleTarget(actor, target, { navigation, now })) {
        return pursueLastKnown(actor, state, navigation, now)
    }
    state.lastKnown = { ...target.position }
    state.locationId = actor.locationId
    state.lastSeenAt = now
    actor.updateFacing({
        x: target.position.x - actor.position.x,
        y: target.position.y - actor.position.y,
    })
    const reached = reachedTarget(
        actor,
        target,
        state.mode,
        navigation.grid.tileWidth
    )
    if (reached) {
        actor.clearPath()
        actor.setMoveInput({ x: 0, y: 0 })
        if (state.mode === 'attack') {
            world.requestAttack(actor, now, target.id)
        }
    } else {
        plan(actor, target.position, state, navigation, now)
    }
    return true
}

function pursueLastKnown(
    actor: GameCharacter,
    state: ControlState,
    navigation: NavigationService,
    now: number
): boolean {
    if (
        state.locationId !== actor.locationId ||
        now - state.lastSeenAt > 5_000 ||
        distance(actor.position, state.lastKnown) <= 3
    ) {
        cancelCharacterControl(actor)
        return false
    }
    plan(actor, state.lastKnown, state, navigation, now)
    return true
}

export function rememberObservedCrossing(
    target: GameCharacter,
    from: string,
    edge: Vector2,
    direction: Vector2,
    characters: Iterable<GameCharacter>,
    navigation: NavigationService,
    now: number
): void {
    for (const observer of characters) {
        const state = controls.get(observer)
        if (
            state?.mode !== 'follow' ||
            state.targetId !== target.id ||
            state.lastSeenAt !== now ||
            state.locationId !== from ||
            observer.locationId !== from
        ) {
            continue
        }
        if (
            distance(observer.position, edge) > sightRange ||
            !navigation.hasLineOfSight(observer.position, edge)
        ) {
            continue
        }
        state.crossing = {
            from,
            to: target.locationId,
            edge: { ...edge },
            direction: { ...direction },
            expiresAt: now + 10_000,
        }
    }
}
function crossKnownExit(
    actor: GameCharacter,
    state: ControlState,
    navigation: NavigationService,
    now: number
): boolean {
    const crossing = state.crossing
    if (
        state.mode !== 'follow' ||
        crossing?.from !== actor.locationId ||
        crossing.expiresAt <= now
    ) {
        cancelCharacterControl(actor)
        return false
    }
    if (distance(actor.position, crossing.edge) <= 1) {
        actor.setMoveInput(crossing.direction)
    } else {
        plan(actor, crossing.edge, state, navigation, now)
    }
    return true
}
function plan(
    actor: GameCharacter,
    point: Vector2,
    state: ControlState,
    navigation: NavigationService,
    now: number
): void {
    if (now - state.lastPlanAt < 300) {
        return
    }
    state.lastPlanAt = now
    actor.setPath(findActorPath(navigation, actor, point))
}
