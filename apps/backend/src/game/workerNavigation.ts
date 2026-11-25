import {
    type AdventureResourceNode,
    type Vector2,
    WORLD_LOCATION_DEFINITIONS,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { findStandingApproach } from './characterSpacing'
import { findActorPath } from './doorNavigation'
import { distance } from './math'
import type { NavigationService } from './navigation'
import { resourceReachable } from './resourcePlacement'
import type { GameRoom } from './room'
import { navigateScenario } from './scenarioNavigation'
import { stepState } from './scenarioState'

/** Professions prefer a known worksite, then use the same route as scenario steps. */
export class WorkerFieldRoute {
    private target:
        { id: string; locationId: string; position: Vector2 } | undefined
    private state: ReturnType<typeof stepState> | undefined

    public advance(
        actor: GameCharacter,
        room: GameRoom,
        target: { id: string; locationId: string; position: Vector2 },
        radius: number,
        now: number
    ): boolean {
        if (
            this.state === undefined ||
            this.target?.id !== target.id ||
            this.target.locationId !== target.locationId ||
            distance(this.target.position, target.position) > 0
        ) {
            this.target = target
            this.state = stepState(actor)
        }
        return (
            navigateScenario(
                actor,
                { step: this.state },
                room,
                target.locationId,
                target.position,
                radius,
                now
            ).state === 'done'
        )
    }
}

export function sourceCost(
    actor: GameCharacter,
    source: { locationId: string; position: Vector2 }
): number {
    const current = WORLD_LOCATION_DEFINITIONS.find(
        (location) => location.id === actor.locationId
    )
    const target = WORLD_LOCATION_DEFINITIONS.find(
        (location) => location.id === source.locationId
    )
    const hops =
        current === undefined || target === undefined
            ? 100
            : Math.abs(current.column - target.column) +
              Math.abs(current.row - target.row)
    return (
        hops * 10_000 +
        (target?.dangerLevel ?? 0) * 1000 +
        distance(actor.position, source.position)
    )
}

export function stop(actor: GameCharacter): void {
    actor.setMoveInput({ x: 0, y: 0 })
    actor.clearPath()
}

/** Fallback for unsupported threats or isolated worker-controller fixtures. */
export function fleeWorker(
    actor: GameCharacter,
    room: GameRoom,
    now: number
): boolean {
    const threat = room.findVisibleTarget(actor, 160, now)
    if (threat === undefined) {
        return false
    }
    const navigation = room.navigationFor(actor)
    const dx = actor.position.x - threat.position.x
    const dy = actor.position.y - threat.position.y
    const scale = 120 / Math.max(1, Math.hypot(dx, dy))
    actor.setPath(
        findActorPath(
            navigation,
            actor,
            walkableNear(navigation, {
                x: actor.position.x + dx * scale,
                y: actor.position.y + dy * scale,
            })
        )
    )
    return true
}

/** Ordinary path movement reaches a border, then ordinary movement intent crosses it. */
export function approach(
    actor: GameCharacter,
    room: GameRoom,
    locationId: string,
    point: Vector2,
    radius = 36
): boolean {
    const navigation = room.navigationFor(actor)
    if (actor.locationId !== locationId) {
        approachLocationEdge(actor, navigation, locationId)
        return false
    }
    if (
        distance(actor.position, point) <= radius &&
        navigation.hasLineOfSight(actor.position, point)
    ) {
        stop(actor)
        return true
    }
    actor.setPath(
        findActorPath(navigation, actor, walkableNear(navigation, point))
    )
    return false
}

export function approachCharacter(
    actor: GameCharacter,
    room: GameRoom,
    target: GameCharacter
): boolean {
    const radius = 36
    if (actor.locationId === target.locationId) {
        const approach = findStandingApproach(actor, target, room, radius)
        if (approach.kind === 'arrived') {
            stop(actor)
            return true
        }
        if (approach.kind === 'approaching') {
            actor.setPath(approach.path)
            return false
        }
    }
    return approach(actor, room, target.locationId, target.position, radius)
}

export function walkableNear(
    navigation: NavigationService,
    point: Vector2
): Vector2 {
    const tile = navigation.worldToTile(navigation.clampWorld(point))
    for (let radius = 0; radius <= 8; radius += 1) {
        for (let y = -radius; y <= radius; y += 1) {
            for (let x = -radius; x <= radius; x += 1) {
                const candidate = { x: tile.x + x, y: tile.y + y }
                if (!navigation.isSolidTile(candidate)) {
                    return navigation.tileToWorld(candidate)
                }
            }
        }
    }
    return navigation.clampWorld(point)
}

export function reachedResource(
    actor: GameCharacter,
    target: AdventureResourceNode,
    navigation: NavigationService
): boolean {
    return (
        actor.locationId === target.locationId &&
        target.bounds !== undefined &&
        resourceReachable(actor, target.bounds, navigation)
    )
}

function approachLocationEdge(
    actor: GameCharacter,
    navigation: NavigationService,
    locationId: string
): void {
    const current = WORLD_LOCATION_DEFINITIONS.find(
        (location) => location.id === actor.locationId
    )
    const destination = WORLD_LOCATION_DEFINITIONS.find(
        (location) => location.id === locationId
    )
    if (current === undefined || destination === undefined) {
        return
    }
    const dx = Math.sign(destination.column - current.column)
    const dy = dx === 0 ? Math.sign(destination.row - current.row) : 0
    const { worldWidth, worldHeight, tileWidth, tileHeight } =
        navigation.summary
    const edge = {
        x:
            dx < 0
                ? tileWidth / 2
                : dx > 0
                  ? worldWidth - tileWidth / 2
                  : worldWidth / 2,
        y:
            dy < 0
                ? tileHeight / 2
                : dy > 0
                  ? worldHeight - tileHeight / 2
                  : worldHeight / 2,
    }
    if (distance(actor.position, edge) <= 2) {
        actor.setMoveInput({ x: dx, y: dy })
    } else {
        actor.setPath(findActorPath(navigation, actor, edge))
    }
}
