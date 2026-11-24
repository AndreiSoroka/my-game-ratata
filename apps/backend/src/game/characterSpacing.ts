import type { Vector2 } from '@my-game-ratata/contracts'

import type { CompanionWorld } from './agentDecisions'
import type { GameCharacter } from './character'
import { available } from './crimeRules'
import { distance, normalize } from './math'
import type { NavigationService } from './navigation'

export const characterClearance = 16
export const stepAsideDistance = 24
const standingDirections = [
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
    { x: -1, y: 1 },
    { x: -1, y: 0 },
    { x: -1, y: -1 },
    { x: 0, y: -1 },
    { x: 1, y: -1 },
].map(normalize)

export function liveSpacingPeer(actor: GameCharacter, other: GameCharacter) {
    return (
        other.id !== actor.id &&
        other.locationId === actor.locationId &&
        available(other)
    )
}

export function standingOccupancy(
    actor: GameCharacter,
    characters: readonly GameCharacter[]
): Vector2[] {
    return characters
        .filter((other) => liveSpacingPeer(actor, other))
        .flatMap((other) => {
            const destination = other.path.at(-1)
            return destination === undefined
                ? [other.position]
                : [other.position, destination]
        })
}

type StandingApproach =
    | { kind: 'arrived' }
    | { kind: 'followingPath' }
    | { kind: 'approaching'; path: Vector2[] }
    | { kind: 'unavailable' }

/** A soft preference for a reachable place beside another character. */
export function findStandingApproach(
    actor: GameCharacter,
    target: GameCharacter,
    world: Pick<CompanionWorld, 'charactersFor' | 'navigationFor'>,
    range: number,
    retainPath = false
): StandingApproach {
    const navigation = world.navigationFor(actor)
    const occupied = standingOccupancy(
        actor,
        world.charactersFor?.(actor) ?? [target]
    )
    const canStand = (point: Vector2) =>
        distance(point, target.position) <= range &&
        occupied.every(
            (other) => distance(point, other) >= characterClearance
        ) &&
        navigation.hasLineOfSight(point, target.position)
    if (canStand(actor.position)) {
        return { kind: 'arrived' }
    }
    const destination = actor.path.at(-1)
    if (
        retainPath &&
        destination !== undefined &&
        insideTravelEdges(destination, navigation) &&
        canStand(destination)
    ) {
        return { kind: 'followingPath' }
    }
    const path = pathToStandingPlace(
        actor,
        target.position,
        range,
        navigation,
        canStand
    )
    return path === undefined
        ? { kind: 'unavailable' }
        : { kind: 'approaching', path }
}

function pathToStandingPlace(
    actor: GameCharacter,
    center: Vector2,
    range: number,
    navigation: NavigationService,
    canStand: (point: Vector2) => boolean
): Vector2[] | undefined {
    const candidates = [
        characterClearance + 1,
        stepAsideDistance,
        range - 1,
    ].flatMap((radius) =>
        standingDirections.map((direction) => offset(center, direction, radius))
    )
    candidates.sort(
        (a, b) => distance(actor.position, a) - distance(actor.position, b)
    )
    const destination = actor.path.at(-1)
    if (destination !== undefined) {
        candidates.unshift(destination)
    }
    for (const point of candidates) {
        if (insideTravelEdges(point, navigation) && canStand(point)) {
            const path = navigation.findPathWorld(actor.position, point)
            if (path.length > 0) {
                return path
            }
        }
    }
    return undefined
}

/** A short direct step through ordinary terrain collision. */
export function sideStepDestination(
    actor: GameCharacter,
    occupied: readonly Vector2[],
    navigation: NavigationService,
    accepts: (point: Vector2) => boolean = () => true
): Vector2 | undefined {
    let rotation = 0
    for (const char of actor.id) {
        rotation = (rotation + char.charCodeAt(0)) % standingDirections.length
    }
    let best: { position: Vector2; score: number } | undefined
    for (const direction of [
        ...standingDirections.slice(rotation),
        ...standingDirections.slice(0, rotation),
    ]) {
        const position = offset(actor.position, direction, stepAsideDistance)
        if (!accepts(position)) {
            continue
        }
        const delta = {
            x: position.x - actor.position.x,
            y: position.y - actor.position.y,
        }
        if (
            distance(
                navigation.moveWithCollision(actor.position, delta),
                position
            ) > 0.01
        ) {
            continue
        }
        const score = Math.min(
            ...occupied.map((point) => distance(point, position))
        )
        if (
            score >= characterClearance &&
            (best === undefined || score > best.score)
        ) {
            best = { position, score }
        }
    }
    return best?.position
}

export function insideTravelEdges(
    point: Vector2,
    navigation: NavigationService
) {
    const { tileWidth, tileHeight, worldWidth, worldHeight } =
        navigation.summary
    return (
        point.x > tileWidth / 2 &&
        point.x < worldWidth - tileWidth / 2 &&
        point.y > tileHeight / 2 &&
        point.y < worldHeight - tileHeight / 2
    )
}

function offset(center: Vector2, direction: Vector2, radius: number): Vector2 {
    return {
        x: center.x + direction.x * radius,
        y: center.y + direction.y * radius,
    }
}
