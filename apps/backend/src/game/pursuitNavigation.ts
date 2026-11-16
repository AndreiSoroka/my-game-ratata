import {
    getWorldLocationDefinition,
    PURSUIT_RULES,
    type Vector2,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { distance } from './math'
import type { NavigationService } from './navigation'
import type { ObservedExit, PursuitState } from './pursuitState'

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
