import type { Vector2 } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { distance, moveToward } from './math'
import type { NavigationService } from './navigation'
import { insidePrayerFear, prayerFearSources } from './prayerAuras'

/** Fear constrains ordinary shared movement, including human intentions and dashes. */
export function resolvePrayerMovement(
    character: GameCharacter,
    desired: Vector2,
    step: number,
    navigation: NavigationService,
    now: number
): Vector2 {
    const sources = prayerFearSources(character, now)
    const inside = sources.filter((source) =>
        insidePrayerFear(source, character, now)
    )
    if (inside.length > 0) {
        character.clearPendingAttackHit()
        const destination = escapePoint(character, sources, navigation, now)
        const next =
            destination === undefined
                ? character.position
                : moveToward(character.position, destination, step)
        desired = navigation.moveWithCollision(character.position, {
            x: next.x - character.position.x,
            y: next.y - character.position.y,
        })
    }
    const forbidden = sources.filter((source) => !inside.includes(source))
    if (forbidden.length === 0) {
        return desired
    }
    // Small collision-compatible segments also prevent a dash crossing an entire field.
    const count = Math.max(
        1,
        Math.ceil(distance(character.position, desired) / 2)
    )
    let result = { ...character.position }
    for (let index = 1; index <= count; index += 1) {
        const ratio = index / count
        const point = {
            x:
                character.position.x +
                (desired.x - character.position.x) * ratio,
            y:
                character.position.y +
                (desired.y - character.position.y) * ratio,
        }
        if (
            forbidden.some((source) =>
                insidePrayerFear(source, character, now, point)
            )
        ) {
            return result
        }
        result = point
    }
    return desired
}

function escapePoint(
    character: GameCharacter,
    sources: readonly GameCharacter[],
    navigation: NavigationService,
    now: number
): Vector2 | undefined {
    const start = navigation.worldToTile(character.position)
    const queue = [start]
    const visited = new Set([`${String(start.x)}:${String(start.y)}`])
    for (const tile of queue) {
        const point = navigation.tileToWorld(tile)
        if (
            !sources.some((source) =>
                insidePrayerFear(source, character, now, point)
            )
        ) {
            const path = navigation.findPathWorld(character.position, point)
            return path.find((next) => distance(character.position, next) > 1)
        }
        for (const neighbor of navigation.walkableNeighbors(tile)) {
            const key = `${String(neighbor.x)}:${String(neighbor.y)}`
            if (!visited.has(key)) {
                visited.add(key)
                queue.push(neighbor)
            }
        }
    }
    return undefined
}
