import {
    getWorldLocationDefinition,
    PURSUIT_RULES,
    type Vector2,
    WORLD_DIRECTIONS,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { portalReach } from './cityPortals'
import { lastHeardCombatNoise } from './hearing'
import { distance } from './math'
import type { NavigationService } from './navigation'
import {
    insideTerritory,
    type ObservedExit,
    type PursuitState,
} from './pursuitState'
import { regionalExit, regionalRoute } from './regionalNavigation'
import type { GameRoom } from './room'

export function planPursuit(
    actor: GameCharacter,
    point: Vector2,
    state: PursuitState,
    navigation: NavigationService,
    now: number
): void {
    if (actor.hasPath() && now - state.lastPlanAt < PURSUIT_RULES.replanMs) {
        return
    }
    state.lastPlanAt = now
    actor.setPath(navigation.findPathWorld(actor.position, point))
}

export function investigateCombatNoise(
    actor: GameCharacter,
    state: PursuitState,
    room: GameRoom,
    now: number
): boolean {
    const sound = lastHeardCombatNoise(actor, room, now)
    if (
        sound === undefined ||
        sound.emittedAt < state.lastSeenAt ||
        !insideTerritory(actor, sound.position) ||
        (state.foreign !== undefined &&
            distance(state.foreign.entry, sound.position) >
                PURSUIT_RULES.foreignRadius)
    ) {
        return false
    }
    if (distance(actor.position, sound.position) <= 8) {
        actor.clearPath()
    } else {
        planPursuit(
            actor,
            sound.position,
            state,
            room.navigationFor(actor),
            now
        )
    }
    return true
}

/** Arrival can use a walkable neighbor when the grave occupies its own anchor tile. */
export function planHomeArrival(
    actor: GameCharacter,
    state: PursuitState,
    navigation: NavigationService,
    now: number
): void {
    const home = state.home.position
    const tile = navigation.worldToTile(home)
    if (!navigation.isSolidTile(tile)) {
        planPursuit(actor, home, state, navigation, now)
        return
    }
    const candidates: Vector2[] = []
    for (let y = -2; y <= 2; y++) {
        for (let x = -2; x <= 2; x++) {
            const point = navigation.tileToWorld({
                x: tile.x + x,
                y: tile.y + y,
            })
            if (
                distance(point, home) <= PURSUIT_RULES.homeArrivalRadius &&
                !navigation.isSolidTile(navigation.worldToTile(point))
            ) {
                candidates.push(point)
            }
        }
    }
    candidates.sort(
        (a, b) => distance(actor.position, a) - distance(actor.position, b)
    )
    const reachable = candidates.find(
        (point) => navigation.findPathWorld(actor.position, point).length > 0
    )
    if (reachable !== undefined) {
        planPursuit(actor, reachable, state, navigation, now)
    }
}

export function approachPursuitExit(
    actor: GameCharacter,
    exit: ObservedExit,
    state: PursuitState,
    navigation: NavigationService,
    now: number
): void {
    if (distance(actor.position, exit.edge) <= 1) {
        actor.setMoveInput(exit.direction)
    } else {
        planPursuit(actor, exit.edge, state, navigation, now)
    }
}

export function homeExit(
    actor: GameCharacter,
    state: PursuitState,
    navigation: NavigationService
): ObservedExit | undefined {
    const current = getWorldLocationDefinition(actor.locationId)
    const home = getWorldLocationDefinition(state.home.locationId)
    if (current === undefined || home === undefined) {
        return undefined
    }
    const dx = Math.sign(home.column - current.column)
    const dy = dx === 0 ? Math.sign(home.row - current.row) : 0
    const { worldWidth, worldHeight, tileWidth, tileHeight } =
        navigation.summary
    const original = state.foreign?.exit.edge
    return {
        from: actor.locationId,
        to: state.home.locationId,
        direction: { x: dx, y: dy },
        edge: {
            x: edgeCoordinate(dx, worldWidth, tileWidth, original?.x),
            y: edgeCoordinate(dy, worldHeight, tileHeight, original?.y),
        },
        expiresAt: Infinity,
    }
}

function edgeCoordinate(
    direction: number,
    size: number,
    tileSize: number,
    fallback: number | undefined
): number {
    return direction < 0
        ? tileSize / 2
        : direction > 0
          ? size - tileSize / 2
          : (fallback ?? size / 2)
}

export function approachPortal(
    actor: GameCharacter,
    endpointId: string,
    state: PursuitState,
    room: GameRoom,
    now: number
): boolean {
    const passage = room.portalPassageFor(actor, endpointId, now)
    if (passage === undefined) {
        return false
    }
    const point = passage.source.position
    const navigation = room.navigationFor(actor)
    if (
        distance(actor.position, point) <= portalReach(navigation) &&
        navigation.hasLineOfSight(actor.position, point)
    ) {
        room.requestPortalUse(actor, endpointId, now)
        return true
    }
    planPursuit(actor, point, state, navigation, now)
    return actor.hasPath()
}

export function approachRegionalHome(
    actor: GameCharacter,
    state: PursuitState,
    room: GameRoom,
    now: number
): void {
    const next = regionalRoute(actor.locationId, state.home.locationId)?.[1]
    if (
        next === undefined ||
        (actor.hasPath() && now - state.lastPlanAt < PURSUIT_RULES.replanMs)
    ) {
        return
    }
    const navigation = room.navigationFor(actor)
    const exit = regionalExit(
        actor.position,
        actor.locationId,
        next,
        navigation
    )
    if (exit === undefined) {
        return
    }
    approachPursuitExit(
        actor,
        {
            from: actor.locationId,
            to: next,
            edge: exit.point,
            direction: WORLD_DIRECTIONS[exit.direction],
            expiresAt: Infinity,
        },
        state,
        navigation,
        now
    )
}
