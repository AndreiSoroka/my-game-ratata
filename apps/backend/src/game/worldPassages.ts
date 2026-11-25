import {
    getWorldLocationDefinition,
    type Vector2,
    WORLD_DIRECTIONS,
    type WorldDirection,
    worldLocationNeighbor,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { cancelCharacterControl } from './characterControl'
import { sparkBlocksTravel } from './combatMovement'
import { available } from './crimeRules'
import type { DungeonPassage } from './dungeonMapData'
import { magicBlocksMovement } from './magicState'
import { distance } from './math'
import { cancelMovementMode } from './movementActions'
import type { NavigationService, TileCoordinate } from './navigation'
import { regionalRoute } from './regionalNavigation'

export function isInsideDungeonPassage(
    position: Vector2,
    passage: DungeonPassage
): boolean {
    return distance(position, passage.position) <= passage.triggerRadius
}

export function canUsePassage(character: GameCharacter, now: number): boolean {
    return (
        available(character) &&
        character.trainingTarget === undefined &&
        character.stunUntil <= now &&
        !character.isActionLocked(now) &&
        !sparkBlocksTravel(character) &&
        !character.combat.defensiveStance &&
        !magicBlocksMovement(character, now)
    )
}

export function stopForPassage(character: GameCharacter): void {
    cancelCharacterControl(character)
    character.setMoveInput({ x: 0, y: 0 })
    cancelMovementMode(character)
}

export function crossedDungeonPassage(
    navigation: NavigationService,
    before: Vector2 | undefined,
    after: Vector2,
    intent: Vector2
): DungeonPassage | undefined {
    if (before === undefined || (intent.x === 0 && intent.y === 0)) {
        return undefined
    }
    let first: DungeonPassage | undefined
    let earliest = Infinity
    for (const passage of navigation.grid.dungeonPassages ?? []) {
        const entry = triggerEntry(before, after, passage)
        if (
            entry !== undefined &&
            entry < earliest &&
            navigation.hasLineOfSight(before, passage.position)
        ) {
            first = passage
            earliest = entry
        }
    }
    return first
}

/** Earliest entry into the circle along actual collision-resolved movement. */
function triggerEntry(
    from: Vector2,
    to: Vector2,
    { position, triggerRadius }: DungeonPassage
): number | undefined {
    const dx = to.x - from.x
    const dy = to.y - from.y
    const x = from.x - position.x
    const y = from.y - position.y
    const a = dx * dx + dy * dy
    const b = x * dx + y * dy
    const c = x * x + y * y - triggerRadius * triggerRadius
    const discriminant = b * b - a * c
    if (a === 0 || c <= 0 || b >= 0 || discriminant < 0) {
        return undefined
    }
    const entry = (-b - Math.sqrt(discriminant)) / a
    return entry <= 1 ? entry : undefined
}

export function dungeonPassageApproach(
    position: Vector2,
    passage: DungeonPassage
): Vector2 {
    return isInsideDungeonPassage(position, passage)
        ? passage.arrival
        : passage.position
}

/** Avoid any unchosen trigger which overlaps the walking tile. */
export function outsideUnchosenPassages(
    navigation: NavigationService,
    tile: TileCoordinate,
    chosen?: DungeonPassage
): boolean {
    const { tileWidth, tileHeight } = navigation.grid
    const center = navigation.tileToWorld(tile)
    return (navigation.grid.dungeonPassages ?? []).every((passage) => {
        if (passage === chosen) {
            return true
        }
        const dx = Math.max(
            0,
            Math.abs(center.x - passage.position.x) - tileWidth / 2
        )
        const dy = Math.max(
            0,
            Math.abs(center.y - passage.position.y) - tileHeight / 2
        )
        return Math.hypot(dx, dy) > passage.triggerRadius
    })
}

export function dungeonPassageTo(
    navigation: NavigationService,
    locationId: string
): DungeonPassage | undefined {
    return navigation.grid.dungeonPassages?.find(
        ({ destinationLocationId }) => destinationLocationId === locationId
    )
}

export function dungeonPassageDestination(
    passage: DungeonPassage,
    fromId: string,
    destination: NavigationService
): DungeonPassage | undefined {
    return destination.grid.dungeonPassages?.find(
        (target) =>
            target.id === passage.destinationPassageId &&
            target.destinationPassageId === passage.id &&
            target.destinationLocationId === fromId &&
            target.direction !== passage.direction
    )
}

export function nextLocationToward(
    fromId: string,
    toId: string,
    passagesAt: (id: string) => readonly DungeonPassage[] | undefined
): string | undefined {
    if (fromId === toId) {
        return undefined
    }
    if (
        getWorldLocationDefinition(fromId) !== undefined &&
        getWorldLocationDefinition(toId) !== undefined
    ) {
        return regionalRoute(fromId, toId)?.[1]
    }
    const seen = new Set([fromId])
    const pending: Array<{ id: string; first?: string }> = [{ id: fromId }]
    for (const { id, first } of pending) {
        if (id === toId) {
            return first
        }
        for (const neighbor of neighboringLocations(id, passagesAt(id))) {
            if (!seen.has(neighbor)) {
                seen.add(neighbor)
                pending.push({ id: neighbor, first: first ?? neighbor })
            }
        }
    }
    return undefined
}

function neighboringLocations(
    id: string,
    passages: readonly DungeonPassage[] | undefined
): string[] {
    const neighbors = (passages ?? []).map(
        ({ destinationLocationId }) => destinationLocationId
    )
    for (const direction of Object.keys(WORLD_DIRECTIONS) as WorldDirection[]) {
        const neighbor = worldLocationNeighbor(id, direction)
        if (neighbor !== undefined) {
            neighbors.push(neighbor.id)
        }
    }
    return neighbors
}
