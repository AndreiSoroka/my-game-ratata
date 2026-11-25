import {
    CENTER_LOCATION_ID,
    type Vector2,
    WORLD_DIRECTIONS,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { pathForEchoReturn } from './doorNavigation'
import type { DungeonPassage } from './dungeonMapData'
import { advanceEchoInn, type EchoInn } from './echoInn'
import { distance } from './math'
import type { NavigationService, TileCoordinate } from './navigation'
import { type RegionalExit, regionalExit } from './regionalNavigation'
import type { GameRoom } from './room'
import { isInsideDungeonPassage, nextLocationToward } from './worldPassages'

export interface EchoReturn {
    locationId?: string
    edge?: RegionalExit
    inn?: EchoInn
    retryAt?: number
}

type EchoWorld = Pick<GameRoom, 'navigationFor' | 'charactersFor'>

/** Plan ordinary path and border intentions. Movement and travel still run in the world tick. */
export function advanceEchoReturn(
    actor: GameCharacter,
    world: EchoWorld,
    state: EchoReturn,
    now: number
): void {
    if (state.locationId !== actor.locationId) {
        actor.setMoveInput({ x: 0, y: 0 })
        state.locationId = actor.locationId
        delete state.edge
        delete state.inn
        delete state.retryAt
    }
    const navigation = world.navigationFor(actor)
    const surfacePath = (point: Vector2) =>
        pathForEchoReturn(navigation, actor, point, (tile) =>
            outsidePassage(tile, navigation)
        )
    if (actor.locationId === CENTER_LOCATION_ID) {
        advanceEchoInn(
            actor,
            world,
            (state.inn ??= {}),
            navigation,
            surfacePath,
            now
        )
        return
    }
    advanceEchoLeg(actor, state, navigation, surfacePath, now)
}

function advanceEchoLeg(
    actor: GameCharacter,
    state: EchoReturn,
    navigation: NavigationService,
    surfacePath: (point: Vector2) => Vector2[],
    now: number
): void {
    if (
        state.edge !== undefined &&
        distance(actor.position, state.edge.point) <= 1
    ) {
        actor.setMoveInput(WORLD_DIRECTIONS[state.edge.direction])
        return
    }
    if (actor.hasPath() || now < (state.retryAt ?? 0)) {
        return
    }
    state.retryAt = now + 500

    const passage = navigation.grid.dungeonPassage
    const next = nextLocationToward(
        actor.locationId,
        CENTER_LOCATION_ID,
        (id) => (id === actor.locationId ? passage : undefined)
    )
    if (next === undefined) {
        return
    }
    if (passage?.destinationLocationId === next) {
        actor.setPath(
            pathForEchoReturn(navigation, actor, stairTarget(actor, passage))
        )
        return
    }

    const edge = regionalExit(
        actor.position,
        actor.locationId,
        next,
        navigation,
        undefined,
        surfacePath
    )
    if (edge !== undefined) {
        state.edge = edge
        actor.setPath(surfacePath(edge.point))
    }
}

function stairTarget(actor: GameCharacter, passage: DungeonPassage): Vector2 {
    // Walking out of the trigger first lets an Echo that begins on it cross normally.
    return isInsideDungeonPassage(actor.position, passage)
        ? passage.arrival
        : passage.position
}

function outsidePassage(
    tile: TileCoordinate,
    navigation: NavigationService
): boolean {
    const passage = navigation.grid.dungeonPassage
    if (passage === undefined) {
        return true
    }
    const center = navigation.tileToWorld(tile)
    const offsetX =
        Math.abs(center.x - passage.position.x) - navigation.grid.tileWidth / 2
    const offsetY =
        Math.abs(center.y - passage.position.y) - navigation.grid.tileHeight / 2
    return (
        Math.hypot(Math.max(0, offsetX), Math.max(0, offsetY)) >
        passage.triggerRadius
    )
}
