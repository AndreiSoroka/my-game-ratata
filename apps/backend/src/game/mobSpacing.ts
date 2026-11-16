import type { Vector2 } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { distance, normalize } from './math'
import type { NavigationService } from './navigation'

const clearance = 16
const stepAside = 24
const directions = [
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
    { x: -1, y: 1 },
    { x: -1, y: 0 },
    { x: -1, y: -1 },
    { x: 0, y: -1 },
    { x: 1, y: -1 },
] as const

/** A controller yields with ordinary movement; it never pushes or relocates another actor. */
export class MobSpacing {
    private replanAt = 0

    public update(
        actor: GameCharacter,
        characters: readonly GameCharacter[],
        navigation: NavigationService,
        now: number,
        targetId?: string
    ): boolean {
        if (actor.stunUntil > now || actor.isActionLocked(now)) {
            return false
        }
        const peers = characters.filter(
            (other) =>
                other.id !== actor.id &&
                other.id !== targetId &&
                other.alive &&
                !other.tags.has('offline') &&
                other.locationId === actor.locationId &&
                other.faction === actor.faction &&
                distance(actor.position, other.position) < stepAside * 3
        )
        const ahead = lookAhead(actor)
        const yields = peers.some(
            (other) =>
                (other.controllerKind === 'network_player' ||
                    actor.id > other.id) &&
                (distance(actor.position, other.position) < clearance ||
                    (ahead !== undefined &&
                        distance(ahead, other.position) < clearance))
        )
        if (!yields) {
            return false
        }
        if (actor.hasPath() && now < this.replanAt) {
            return true
        }
        const points = peers.flatMap((other) => {
            const planned = other.nextPathPoint()
            return planned !== undefined &&
                distance(other.position, planned) <= stepAside * 2
                ? [other.position, planned]
                : [other.position]
        })
        const destination = this.destination(actor, points, navigation)
        if (destination === undefined) {
            return false
        }
        actor.setPath([destination])
        this.replanAt = now + 300
        return true
    }

    private destination(
        actor: GameCharacter,
        occupied: Vector2[],
        navigation: NavigationService
    ): Vector2 | undefined {
        let offset = 0
        for (const char of actor.id) {
            offset = (offset + char.charCodeAt(0)) % directions.length
        }
        let best: { position: Vector2; score: number } | undefined
        for (const candidate of [
            ...directions.slice(offset),
            ...directions.slice(0, offset),
        ]) {
            const direction = normalize(candidate)
            const delta = {
                x: direction.x * stepAside,
                y: direction.y * stepAside,
            }
            const position = {
                x: actor.position.x + delta.x,
                y: actor.position.y + delta.y,
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
                score >= clearance &&
                (best === undefined || score > best.score)
            ) {
                best = { position, score }
            }
        }
        return best?.position
    }
}

function lookAhead(actor: GameCharacter): Vector2 | undefined {
    const next = actor.nextPathPoint()
    if (next === undefined) {
        return undefined
    }
    const direction = normalize({
        x: next.x - actor.position.x,
        y: next.y - actor.position.y,
    })
    return {
        x: actor.position.x + direction.x * clearance,
        y: actor.position.y + direction.y * clearance,
    }
}
