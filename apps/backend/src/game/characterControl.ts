import type {
    CharacterControlCommand,
    CharacterControlSnapshot,
    Vector2,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { isTargetInAttackRange } from './combat'
import { companionProfiles } from './companionProfiles'
import { canTargetByFaction } from './factions'
import { distance } from './math'
import type { NavigationService } from './navigation'
import { visibilityRadius } from './queries'

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
export interface ControlWorld {
    getCharacter(id: string): GameCharacter | undefined
    navigationFor(actor: GameCharacter): NavigationService
    requestAttack(actor: GameCharacter, now?: number, targetId?: string): void
}
const controls = new WeakMap<GameCharacter, ControlState>()
const sightRange = 240

export function snapshotControl(
    actor: GameCharacter
): CharacterControlSnapshot {
    const state = controls.get(actor)
    return { mode: state?.mode ?? 'none', targetId: state?.targetId ?? null }
}
export function cancelCharacterControl(actor: GameCharacter): void {
    if (!controls.delete(actor)) {
        return
    }
    actor.clearPath()
    actor.setMoveInput({ x: 0, y: 0 })
}
export function parseControlCommand(
    record: Record<string, unknown>
): CharacterControlCommand | undefined {
    if (record['type'] === 'cancel_control') {
        return { type: 'cancel_control' }
    }
    if (record['type'] !== 'follow' && record['type'] !== 'auto_attack') {
        return undefined
    }
    const targetId = record['targetId']
    return targetId === null ||
        (typeof targetId === 'string' &&
            targetId.length > 0 &&
            targetId.length <= 100)
        ? { type: record['type'], targetId }
        : undefined
}
export function setCharacterControl(
    actor: GameCharacter,
    command: CharacterControlCommand,
    world: ControlWorld,
    now: number
): boolean {
    if (command.type === 'cancel_control' || command.targetId === null) {
        cancelCharacterControl(actor)
        return true
    }
    const target = world.getCharacter(command.targetId)
    const navigation = world.navigationFor(actor)
    if (
        !available(actor, now) ||
        target === undefined ||
        !available(target) ||
        actor.id === target.id ||
        !visible(actor, target, navigation, now)
    ) {
        return false
    }
    const hostile = canTargetByFaction(actor, target, now)
    if (
        (command.type === 'auto_attack') !== hostile ||
        (command.type === 'auto_attack' && !canFight(actor))
    ) {
        return false
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
    if (!visible(actor, target, navigation, now)) {
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

function reachedTarget(
    actor: GameCharacter,
    target: GameCharacter,
    mode: CharacterControlSnapshot['mode'],
    tileSize: number
): boolean {
    return mode === 'attack'
        ? isTargetInAttackRange(actor, target, tileSize)
        : distance(actor.position, target.position) <= 28
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

function canFight(actor: GameCharacter): boolean {
    return (
        companionProfiles[actor.id]?.canFight !== false &&
        actor.soul.companion?.canFight !== false
    )
}

function allowedMode(
    actor: GameCharacter,
    target: GameCharacter,
    mode: CharacterControlSnapshot['mode'],
    now: number
): boolean {
    const hostile = canTargetByFaction(actor, target, now)
    return mode === 'attack' ? hostile && canFight(actor) : !hostile
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
    actor.setPath(navigation.findPathWorld(actor.position, point))
}
function visible(
    actor: GameCharacter,
    target: GameCharacter,
    navigation: NavigationService,
    now: number
): boolean {
    return (
        actor.locationId === target.locationId &&
        distance(actor.position, target.position) <=
            visibilityRadius(actor, target, sightRange, now) &&
        navigation.hasLineOfSight(actor.position, target.position)
    )
}
function available(actor: GameCharacter, now?: number): boolean {
    return (
        actor.alive &&
        !actor.tags.has('offline') &&
        !actor.tags.has('state.retired') &&
        (now === undefined || actor.stunUntil <= now)
    )
}
