import type { Vector2, WorldObjectBounds } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { characterClearance, standingOccupancy } from './characterSpacing'
import {
    containsBuildingPoint,
    type MapBuildingDefinition,
} from './mapBuildings'
import { distance, normalize } from './math'
import type { NavigationService } from './navigation'
import type { GameRoom } from './room'

interface InnDestination {
    kind: 'seat' | 'waiting'
    point: Vector2
}

export interface EchoInn {
    destination?: InnDestination
    retryAt?: number
    seated?: true
}

/** Reserve seats by publishing the actual path endpoint to the same world as other characters. */
export function advanceEchoInn(
    actor: GameCharacter,
    world: Pick<GameRoom, 'charactersFor'>,
    state: EchoInn,
    navigation: NavigationService,
    pathTo: (point: Vector2) => Vector2[],
    now: number
): void {
    if (!readyToPlan(actor, state, now)) {
        return
    }
    const inn = navigation.grid.buildings?.find(
        (building) => building.kind === 'inn'
    )
    if (inn === undefined) {
        return
    }
    const occupied = standingOccupancy(actor, world.charactersFor(actor))
    const free = (point: Vector2) =>
        occupied.every((other) => distance(point, other) >= characterClearance)
    if (keepSeat(actor, state, free)) {
        return
    }

    const availableSeat = planInnDestination(
        seatCandidates(inn, navigation, actor.position),
        'seat',
        free,
        pathTo
    )
    if (availableSeat !== undefined) {
        actor.setPath(availableSeat.path)
        state.destination = availableSeat.destination
        return
    }
    if (keepWaiting(actor, state.destination, free)) {
        return
    }
    const waiting = planInnDestination(
        waitingCandidates(inn, navigation),
        'waiting',
        free,
        pathTo
    )
    actor.setPath(waiting?.path ?? [])
    if (waiting !== undefined) {
        state.destination = waiting.destination
    } else {
        delete state.destination
    }
}

function readyToPlan(
    actor: GameCharacter,
    state: EchoInn,
    now: number
): boolean {
    const previous = state.destination
    if (
        state.seated === true &&
        previous !== undefined &&
        distance(actor.position, previous.point) <= 1
    ) {
        return false
    }
    delete state.seated
    if (now < (state.retryAt ?? 0)) {
        return false
    }
    state.retryAt = now + 500
    return true
}

function keepSeat(
    actor: GameCharacter,
    state: EchoInn,
    free: (point: Vector2) => boolean
): boolean {
    const previous = state.destination
    if (previous?.kind !== 'seat' || !free(previous.point)) {
        return false
    }
    if (distance(actor.position, previous.point) > 1) {
        return actor.hasPath()
    }
    state.seated = true
    return true
}

function keepWaiting(
    actor: GameCharacter,
    previous: InnDestination | undefined,
    free: (point: Vector2) => boolean
): boolean {
    return (
        previous?.kind === 'waiting' &&
        free(previous.point) &&
        (actor.hasPath() || distance(actor.position, previous.point) <= 1)
    )
}

function planInnDestination(
    candidates: Vector2[],
    kind: InnDestination['kind'],
    free: (point: Vector2) => boolean,
    pathTo: (point: Vector2) => Vector2[]
): { destination: InnDestination; path: Vector2[] } | undefined {
    for (const point of candidates) {
        if (!free(point)) {
            continue
        }
        const path = pathTo(point)
        if (path.length > 0) {
            return { destination: { kind, point }, path }
        }
    }
    return undefined
}

function seatCandidates(
    inn: MapBuildingDefinition,
    navigation: NavigationService,
    from: Vector2
): Vector2[] {
    const { tileWidth, tileHeight } = navigation.grid
    const onSide = besideDoor(inn, navigation)
    const doorClearance = Math.min(tileWidth, tileHeight) * 1.5
    return standableCenters(inn.bounds, navigation)
        .filter(
            (point) =>
                containsBuildingPoint(inn.bounds, point) &&
                onSide(point) &&
                distance(point, inn.entry) >= doorClearance
        )
        .sort((a, b) => distance(a, from) - distance(b, from))
}

function waitingCandidates(
    inn: MapBuildingDefinition,
    navigation: NavigationService
): Vector2[] {
    const { tileWidth, tileHeight } = navigation.grid
    const onSide = besideDoor(inn, navigation)
    const nearby = {
        x: inn.entry.x - tileWidth * 3,
        y: inn.entry.y - tileHeight * 3,
        width: tileWidth * 6,
        height: tileHeight * 6,
    }
    return standableCenters(nearby, navigation)
        .filter(
            (point) =>
                !containsBuildingPoint(inn.bounds, point) && onSide(point)
        )
        .sort((a, b) => distance(a, inn.entry) - distance(b, inn.entry))
}

function besideDoor(inn: MapBuildingDefinition, navigation: NavigationService) {
    const { tileWidth, tileHeight } = navigation.grid
    const hall = normalize({
        x: inn.interior.x - inn.entry.x,
        y: inn.interior.y - inn.entry.y,
    })
    return (point: Vector2) =>
        Math.abs(
            (point.x - inn.entry.x) * hall.y - (point.y - inn.entry.y) * hall.x
        ) >=
        Math.min(tileWidth, tileHeight) / 2
}

function standableCenters(
    bounds: WorldObjectBounds,
    navigation: NavigationService
): Vector2[] {
    const { width } = navigation.grid
    return navigation.cellsInBounds(bounds).flatMap((cell) => {
        const tile = { x: cell % width, y: Math.floor(cell / width) }
        if (navigation.isSolidTile(tile)) {
            return []
        }
        const point = navigation.tileToWorld(tile)
        return navigation.doorAt(point) === undefined ? [point] : []
    })
}
