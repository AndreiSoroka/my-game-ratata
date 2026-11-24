import type { Vector2 } from '@my-game-ratata/contracts'

import { distance } from './math'
import type { NavigationService } from './navigation'

export interface StopCorrectionLeg {
    from: Vector2
    to: Vector2
    at: number
}

interface Candidate {
    position: Vector2
    cost: number
}

const epsilon = 1e-8

/** Compare the nearest points on the available forward and retrace paths. */
export function closestStopPosition(
    origin: Vector2,
    requested: Vector2,
    credit: number,
    forward: { axis: Vector2; remaining: number } | undefined,
    backward: readonly StopCorrectionLeg[],
    navigation: NavigationService
): Candidate {
    let best: Candidate = { position: origin, cost: 0 }
    function consider(from: Vector2, end: Vector2, spent: number): void {
        const position = projectOntoLeg(from, end, requested)
        if (
            distance(position, requested) < distance(best.position, requested)
        ) {
            best = { position, cost: spent + distance(from, position) }
        }
    }

    if (forward !== undefined) {
        const length = Math.min(credit, forward.remaining)
        const endpoint = {
            x: origin.x + forward.axis.x * length,
            y: origin.y + forward.axis.y * length,
        }
        consider(origin, walkablePrefix(origin, endpoint, navigation), 0)
    }

    let cursor = origin
    let spent = 0
    for (
        let index = backward.length - 1;
        index >= 0 && spent < credit;
        index--
    ) {
        const leg = backward[index]
        if (leg === undefined || distance(leg.to, cursor) > epsilon) {
            break
        }
        const length = distance(leg.from, cursor)
        const point = pointAlong(
            cursor,
            leg.from,
            Math.min(1, (credit - spent) / length)
        )
        const endpoint = walkablePrefix(cursor, point, navigation)
        consider(cursor, endpoint, spent)
        if (distance(endpoint, leg.from) > epsilon) {
            break
        }
        spent += length
        cursor = leg.from
    }
    return best
}

function pointAlong(from: Vector2, to: Vector2, ratio: number): Vector2 {
    return {
        x: from.x + (to.x - from.x) * ratio,
        y: from.y + (to.y - from.y) * ratio,
    }
}

function projectOntoLeg(from: Vector2, to: Vector2, point: Vector2): Vector2 {
    const x = to.x - from.x
    const y = to.y - from.y
    const lengthSquared = x * x + y * y
    if (lengthSquared === 0) {
        return from
    }
    const ratio =
        ((point.x - from.x) * x + (point.y - from.y) * y) / lengthSquared
    return pointAlong(from, to, Math.max(0, Math.min(1, ratio)))
}

function walkablePrefix(
    from: Vector2,
    to: Vector2,
    navigation: NavigationService
): Vector2 {
    if (isStraightMovementClear(from, to, navigation)) {
        return to
    }
    let low = 0
    let high = 1
    for (let iteration = 0; iteration < 24; iteration++) {
        const middle = (low + high) / 2
        if (
            isStraightMovementClear(
                from,
                pointAlong(from, to, middle),
                navigation
            )
        ) {
            low = middle
        } else {
            high = middle
        }
    }
    return pointAlong(from, to, low)
}

function isStraightMovementClear(
    from: Vector2,
    to: Vector2,
    navigation: NavigationService
): boolean {
    const x = to.x - from.x
    const y = to.y - from.y
    if (navigation.isSolidTile(navigation.worldToTile(to))) {
        return false
    }
    const moved = navigation.moveWithCollision(from, { x, y })
    if (Math.hypot(moved.x - to.x, moved.y - to.y) > 1e-8) {
        return false
    }
    const crossings = [
        ...tileCrossings(from.x, to.x, navigation.grid.tileWidth),
        ...tileCrossings(from.y, to.y, navigation.grid.tileHeight),
        1,
    ].sort((left, right) => left - right)
    let previous = 0
    for (const ratio of crossings) {
        const between = (previous + ratio) / 2
        const sample = { x: from.x + x * between, y: from.y + y * between }
        if (navigation.isSolidTile(navigation.worldToTile(sample))) {
            return false
        }
        previous = ratio
    }
    return true
}

function tileCrossings(from: number, to: number, size: number): number[] {
    const crossings: number[] = []
    const first = Math.floor(Math.min(from, to) / size) + 1
    for (
        let boundary = first * size;
        boundary < Math.max(from, to);
        boundary += size
    ) {
        const ratio = (boundary - from) / (to - from)
        if (ratio > 0 && ratio < 1) {
            crossings.push(ratio)
        }
    }
    return crossings
}
