import {
    type MapSummary,
    type Vector2,
    WORLD_LOCATION_DEFINITIONS,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { distance } from './math'
import type { NavigationService } from './navigation'
import type { GameRoom } from './room'
import type { ScenarioRuntime } from './scenarioState'

export interface ScenarioOutcome {
    state: 'done' | 'progress' | 'waiting' | 'blocked'
    reason?: string
}
/** Crosses authored adjacent locations with ordinary movement; never writes position. */
export function navigateScenario(
    actor: GameCharacter,
    run: ScenarioRuntime,
    room: GameRoom,
    locationId: string,
    point: Vector2,
    radius: number,
    now: number
): ScenarioOutcome {
    const navigation = room.navigationFor(actor)
    if (actor.locationId !== locationId) {
        return travelToward(actor, run, room, locationId, now)
    }
    if (!pointInsideLocation(point, navigation)) {
        actor.clearPath()
        actor.setMoveInput({ x: 0, y: 0 })
        return {
            state: 'blocked',
            reason: 'Точка находится за доступными границами локации.',
        }
    }
    const remaining = distance(actor.position, point)
    if (
        remaining <= radius &&
        navigation.hasLineOfSight(actor.position, point)
    ) {
        actor.clearPath()
        actor.setMoveInput({ x: 0, y: 0 })
        return { state: 'done' }
    }
    const progress = madeProgress(actor, run, remaining)
    if (!actor.hasPath() || now - run.step.lastPlanAt >= 1000) {
        actor.setPath(pathToReach(actor, room, point, radius))
        run.step.lastPlanAt = now
    }
    return {
        state: progress ? 'progress' : 'blocked',
        reason: actor.hasPath()
            ? 'Нет продвижения к цели.'
            : 'Путь к цели недоступен.',
    }
}

function pointInsideLocation(
    point: Vector2,
    navigation: NavigationService
): boolean {
    const clamped = navigation.clampWorld(point)
    return point.x === clamped.x && point.y === clamped.y
}
function madeProgress(
    actor: GameCharacter,
    run: ScenarioRuntime,
    remaining: number
): boolean {
    const changedLocation = actor.locationId !== run.step.previousLocation
    const progressed =
        changedLocation ||
        distance(actor.position, run.step.previousPosition) >= 0.1
    run.step.previousLocation = actor.locationId
    run.step.previousPosition = { ...actor.position }
    run.step.previousDistance = remaining
    return progressed
}
function pathToReach(
    actor: GameCharacter,
    room: GameRoom,
    point: Vector2,
    radius: number
): Vector2[] {
    const nav = room.navigationFor(actor)
    const direct = nav.findPathWorld(actor.position, point)
    if (direct.length > 0) {
        return direct
    }
    const tile = nav.worldToTile(point)
    const cells =
        Math.ceil(radius / Math.min(nav.grid.tileWidth, nav.grid.tileHeight)) +
        1
    const candidates: Vector2[] = []
    for (let y = -cells; y <= cells; y += 1) {
        for (let x = -cells; x <= cells; x += 1) {
            const candidate = nav.tileToWorld({ x: tile.x + x, y: tile.y + y })
            if (
                distance(candidate, point) <= radius &&
                nav.hasLineOfSight(candidate, point)
            ) {
                candidates.push(candidate)
            }
        }
    }
    candidates.sort(
        (a, b) => distance(actor.position, a) - distance(actor.position, b)
    )
    for (const candidate of candidates) {
        const path = nav.findPathWorld(actor.position, candidate)
        if (path.length > 0) {
            return path
        }
    }
    return []
}
function travelToward(
    actor: GameCharacter,
    run: ScenarioRuntime,
    room: GameRoom,
    locationId: string,
    now: number
): ScenarioOutcome {
    const current = WORLD_LOCATION_DEFINITIONS.find(
        (entry) => entry.id === actor.locationId
    )
    const target = WORLD_LOCATION_DEFINITIONS.find(
        (entry) => entry.id === locationId
    )
    if (current === undefined || target === undefined) {
        return { state: 'blocked', reason: 'Неизвестная локация.' }
    }
    const neighbors = WORLD_LOCATION_DEFINITIONS.filter(
        (entry) =>
            Math.abs(entry.column - current.column) +
                Math.abs(entry.row - current.row) ===
            1
    )
    const next = neighbors.sort(
        (a, b) =>
            Math.abs(a.column - target.column) +
            Math.abs(a.row - target.row) -
            (Math.abs(b.column - target.column) + Math.abs(b.row - target.row))
    )[0]
    if (next === undefined) {
        return { state: 'blocked', reason: 'Нет доступного перехода.' }
    }
    const direction = {
        x: next.column - current.column,
        y: next.row - current.row,
    }
    const edge = crossingEdge(
        actor.position,
        direction,
        room.navigationFor(actor).summary
    )
    if (distance(actor.position, edge) <= 1) {
        const progressed = madeProgress(
            actor,
            run,
            distance(actor.position, edge)
        )
        actor.setMoveInput(direction)
        return {
            state: progressed ? 'progress' : 'blocked',
            reason: 'Переход в соседнюю локацию пока не состоялся.',
        }
    }
    const progressed = madeProgress(actor, run, distance(actor.position, edge))
    if (!actor.hasPath() || now - run.step.lastPlanAt >= 1000) {
        actor.setPath(
            room.navigationFor(actor).findPathWorld(actor.position, edge)
        )
        run.step.lastPlanAt = now
    }
    return {
        state: progressed ? 'progress' : 'blocked',
        reason: 'Не удаётся подойти к выходу.',
    }
}

function crossingEdge(
    position: Vector2,
    direction: Vector2,
    summary: MapSummary
): Vector2 {
    return {
        x:
            direction.x < 0
                ? summary.tileWidth / 2
                : direction.x > 0
                  ? summary.worldWidth - summary.tileWidth / 2
                  : Math.min(
                        summary.worldWidth - summary.tileWidth / 2,
                        Math.max(summary.tileWidth / 2, position.x)
                    ),
        y:
            direction.y < 0
                ? summary.tileHeight / 2
                : direction.y > 0
                  ? summary.worldHeight - summary.tileHeight / 2
                  : Math.min(
                        summary.worldHeight - summary.tileHeight / 2,
                        Math.max(summary.tileHeight / 2, position.y)
                    ),
    }
}
