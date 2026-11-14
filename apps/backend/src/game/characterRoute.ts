import type {
    CharacterControlSnapshot,
    CharacterRouteSnapshot,
    Vector2,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { ControlWorld } from './controlWorld'
import { distance } from './math'
import type { NavigationService } from './navigation'

export const MAX_ROUTE_POINTS = 32
export const ROUTE_FAILURE_MS = 10_000
const routes = new WeakMap<GameCharacter, RouteState>()

interface RouteState extends CharacterRouteSnapshot {
    nextNumber: number
    lastPosition: Vector2
    lastUpdateAt: number
    failedMs: number
    lastPlanAt: number
}

export function hasCharacterRoute(actor: GameCharacter): boolean {
    return routes.has(actor)
}

export function clearCharacterRoute(actor: GameCharacter): boolean {
    return routes.delete(actor)
}

export function snapshotCharacterRoute(
    actor: GameCharacter
): CharacterControlSnapshot | undefined {
    const route = routes.get(actor)
    return route === undefined
        ? undefined
        : {
              mode: 'route',
              targetId: null,
              route: {
                  locationId: route.locationId,
                  points: structuredClone(route.points),
                  waiting: route.waiting,
              },
          }
}

/** A route chooses movement intentions; collision and displacement remain shared. */
export function enqueueCharacterRoute(
    actor: GameCharacter,
    target: Vector2,
    append: boolean,
    navigation: NavigationService,
    now: number
): boolean {
    if (
        !actor.alive ||
        actor.tags.has('offline') ||
        actor.tags.has('state.retired')
    ) {
        return false
    }
    const existing = append ? routes.get(actor) : undefined
    if (existing !== undefined && existing.points.length >= MAX_ROUTE_POINTS) {
        return false
    }
    const state: RouteState = existing ?? {
        locationId: actor.locationId,
        points: [],
        waiting: null,
        nextNumber: 1,
        lastPosition: { ...actor.position },
        lastUpdateAt: now,
        failedMs: 0,
        lastPlanAt: -Infinity,
    }
    state.points.push({
        number: state.nextNumber++,
        position: navigation.clampWorld(target),
    })
    routes.set(actor, state)
    if (existing === undefined) {
        actor.setMoveInput({ x: 0, y: 0 })
        plan(actor, state, navigation, now)
    }
    return true
}

export function advanceCharacterRoute(
    actor: GameCharacter,
    world: ControlWorld,
    now: number
): boolean | undefined {
    const state = routes.get(actor)
    if (state === undefined) {
        return undefined
    }
    if (
        !actor.alive ||
        actor.tags.has('offline') ||
        actor.tags.has('state.retired') ||
        actor.locationId !== state.locationId
    ) {
        stop(actor)
        return false
    }
    const deltaMs = Math.max(0, now - state.lastUpdateAt)
    state.lastUpdateAt = now
    if (actor.isActionLocked(now) || actor.stunUntil > now) {
        state.lastPosition = { ...actor.position }
        return true
    }
    return advanceRoutePoint(actor, state, world, now, deltaMs)
}

function advanceRoutePoint(
    actor: GameCharacter,
    state: RouteState,
    world: ControlWorld,
    now: number,
    deltaMs: number
): boolean {
    const point = state.points[0]
    if (point === undefined) {
        stop(actor)
        return false
    }
    if (distance(actor.position, point.position) <= 1) {
        state.points.shift()
        return nextPoint(actor, state, world.navigationFor(actor), now)
    }
    if (distance(actor.position, state.lastPosition) >= 0.5) {
        state.failedMs = 0
        state.lastPosition = { ...actor.position }
        state.waiting = null
    } else {
        state.failedMs += deltaMs
    }
    if (state.failedMs >= ROUTE_FAILURE_MS) {
        world.publishEvents?.([
            {
                kind: 'notice',
                actorId: actor.id,
                audienceIds: [actor.id],
                text: `Точка ${String(point.number)} недоступна: пропускаю после 10 секунд без продвижения.`,
            },
        ])
        state.points.shift()
        return nextPoint(actor, state, world.navigationFor(actor), now)
    }
    if (
        !actor.hasPath() ||
        (state.failedMs >= 500 && now - state.lastPlanAt >= 500)
    ) {
        plan(actor, state, world.navigationFor(actor), now)
    }
    return true
}

function nextPoint(
    actor: GameCharacter,
    state: RouteState,
    navigation: NavigationService,
    now: number
): boolean {
    actor.clearPath()
    if (state.points.length === 0) {
        stop(actor)
        return false
    }
    state.failedMs = 0
    state.lastPosition = { ...actor.position }
    state.lastPlanAt = -Infinity
    plan(actor, state, navigation, now)
    return true
}

function plan(
    actor: GameCharacter,
    state: RouteState,
    navigation: NavigationService,
    now: number
): void {
    if (now - state.lastPlanAt < 500) {
        return
    }
    state.lastPlanAt = now
    const point = state.points[0]
    if (point === undefined) {
        return
    }
    actor.setPath(navigation.findPathWorld(actor.position, point.position))
    state.waiting = actor.hasPath() ? null : 'blocked'
}

function stop(actor: GameCharacter): void {
    routes.delete(actor)
    actor.clearPath()
    actor.setMoveInput({ x: 0, y: 0 })
}
