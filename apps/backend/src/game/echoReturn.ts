import {
    CENTER_LOCATION_ID,
    type Vector2,
    WORLD_DIRECTIONS,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { pathForEchoReturn } from './doorNavigation'
import { advanceEchoInn, type EchoInn } from './echoInn'
import { distance } from './math'
import type { NavigationService } from './navigation'
import {
    type RegionalExit,
    regionalExit,
    regionalRoute,
} from './regionalNavigation'
import type { GameRoom } from './room'
import {
    dungeonPassageApproach,
    outsideUnchosenPassages,
} from './worldPassages'

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
            outsideUnchosenPassages(navigation, tile)
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

    const up = navigation.grid.dungeonPassages?.find(
        ({ direction }) => direction === 'up'
    )
    if (up !== undefined) {
        actor.setPath(
            pathForEchoReturn(
                navigation,
                actor,
                dungeonPassageApproach(actor.position, up),
                (tile) => outsideUnchosenPassages(navigation, tile, up)
            )
        )
        return
    }
    const next = regionalRoute(actor.locationId, CENTER_LOCATION_ID)?.[1]
    if (next === undefined) {
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
