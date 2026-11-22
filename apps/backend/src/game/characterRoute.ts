import type {
    CharacterControlSnapshot,
    CharacterRoutePoint,
    CharacterRouteSnapshot,
    Vector2,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { canWalkDuringPrayer } from './combatMovement'
import type { ControlWorld } from './controlWorld'
import { distance } from './math'
import type { NavigationService } from './navigation'
import { routeCommandFeedback } from './routeCommandFeedback'
import { resolveRouteDestination } from './routeDestination'

export const MAX_ROUTE_POINTS = 32
export const ROUTE_FAILURE_MS = 10_000
const routes = new WeakMap<GameCharacter, RouteState>()

interface RoutePoint extends CharacterRoutePoint {
    requestedPosition: Vector2
}
interface RouteState extends Omit<
    CharacterRouteSnapshot,
    'points' | 'remainingFailureMs'
> {
    points: RoutePoint[]
    nextNumber: number
    lastPosition: Vector2
    lastUpdateAt: number
    failedMs: number
    lastPlanAt: number
}

export type RouteEnqueueResult =
    | { accepted: true; point: CharacterRoutePoint; adjusted: boolean }
    | { accepted: false; reason: 'unavailable' | 'full' | 'unreachable' }

export function hasCharacterRoute(actor: GameCharacter): boolean {
    return routes.has(actor)
}

export function clearCharacterRoute(actor: GameCharacter): boolean {
    return routes.delete(actor)
}

/** Voluntary pauses defer elapsed time without forgiving prior blocked time. */
export function deferCharacterRoute(actor: GameCharacter, now: number): void {
    const route = routes.get(actor)
    if (route !== undefined) {
        route.lastUpdateAt = now
    }
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
                  points: route.points.map(({ number, position }) => ({
                      number,
                      position: { ...position },
                  })),
                  waiting: route.waiting,
                  remainingFailureMs: Math.max(
                      0,
                      ROUTE_FAILURE_MS - route.failedMs
                  ),
              },
          }
}

/** A route chooses movement intentions; collision and displacement remain shared. */
export function enqueueCharacterRoute(
    actor: GameCharacter,
    target: Vector2,
    append: boolean,
    navigation: NavigationService,
    now: number,
    beforeStart?: () => void
): RouteEnqueueResult {
    if (!availableActor(actor)) {
        return { accepted: false, reason: 'unavailable' }
    }
    const existing = appendedRoute(actor, append)
    if (existing !== undefined && existing.points.length >= MAX_ROUTE_POINTS) {
        return { accepted: false, reason: 'full' }
    }
    const from = routeOrigin(actor, existing)
    const resolved = resolveRouteDestination(from, target, navigation)
    if (resolved === undefined) {
        return { accepted: false, reason: 'unreachable' }
    }
    if (existing === undefined) {
        beforeStart?.()
    }
    const state = existing ?? createRoute(actor, now)
    const point: RoutePoint = {
        number: state.nextNumber++,
        position: { ...resolved.destination },
        requestedPosition: { ...resolved.requestedPosition },
    }
    state.points.push(point)
    routes.set(actor, state)
    if (existing === undefined) {
        actor.setMoveInput({ x: 0, y: 0 })
        actor.setPath(resolved.path)
    }
    return {
        accepted: true,
        point: { number: point.number, position: { ...point.position } },
        adjusted: distance(point.position, resolved.requestedPosition) > 0,
    }
}

function availableActor(actor: GameCharacter): boolean {
    return (
        actor.alive &&
        !actor.tags.has('offline') &&
        !actor.tags.has('state.retired')
    )
}
function appendedRoute(
    actor: GameCharacter,
    append: boolean
): RouteState | undefined {
    const route = append ? routes.get(actor) : undefined
    return route?.locationId === actor.locationId ? route : undefined
}
function routeOrigin(
    actor: GameCharacter,
    route: RouteState | undefined
): Vector2 {
    return route?.points.at(-1)?.position ?? actor.position
}
function createRoute(actor: GameCharacter, now: number): RouteState {
    return {
        locationId: actor.locationId,
        points: [],
        waiting: null,
        nextNumber: 1,
        lastPosition: { ...actor.position },
        lastUpdateAt: now,
        failedMs: 0,
        lastPlanAt: now,
    }
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
    if (
        (actor.isActionLocked(now) && !canWalkDuringPrayer(actor)) ||
        actor.stunUntil > now
    ) {
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
        return nextPoint(actor, state, world, now)
    }
    if (distance(actor.position, state.lastPosition) >= 0.5) {
        state.failedMs = 0
        state.lastPosition = { ...actor.position }
        state.waiting = null
    } else {
        state.failedMs += deltaMs
        if (state.failedMs >= 500) {
            state.waiting = 'blocked'
        }
    }
    if (state.failedMs >= ROUTE_FAILURE_MS) {
        stop(actor)
        world.publishEvents?.([
            {
                kind: 'notice',
                actorId: actor.id,
                audienceIds: [actor.id],
                text: `Маршрут отменён: к точке ${String(point.number)} нет прохода`,
            },
        ])
        return false
    }
    if (
        !actor.hasPath() ||
        (state.failedMs >= 500 && now - state.lastPlanAt >= 500)
    ) {
        plan(actor, state, world, now)
    }
    return true
}

function nextPoint(
    actor: GameCharacter,
    state: RouteState,
    world: ControlWorld,
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
    plan(actor, state, world, now)
    return true
}

function plan(
    actor: GameCharacter,
    state: RouteState,
    world: ControlWorld,
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
    const resolved = resolveRouteDestination(
        actor.position,
        point.requestedPosition,
        world.navigationFor(actor)
    )
    if (resolved === undefined) {
        actor.clearPath()
        state.waiting = 'blocked'
        return
    }
    const adjusted = distance(point.position, resolved.destination) > 0
    point.position = { ...resolved.destination }
    actor.setPath(resolved.path)
    state.waiting = state.failedMs >= 500 ? 'blocked' : null
    if (adjusted) {
        world.publishEvents?.(
            routeCommandFeedback(actor, {
                accepted: true,
                adjusted: true,
                point: {
                    number: point.number,
                    position: { ...point.position },
                },
            })
        )
    }
}

function stop(actor: GameCharacter): void {
    routes.delete(actor)
    actor.clearPath()
    actor.setMoveInput({ x: 0, y: 0 })
}
