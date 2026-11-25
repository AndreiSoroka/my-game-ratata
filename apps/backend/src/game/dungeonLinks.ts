import type { WorldLocation } from '@my-game-ratata/contracts'

import type { DungeonPassage } from './dungeonMapData'
import { distance } from './math'
import type { NavigationService } from './navigation'
import {
    dungeonPassageDestination,
    isInsideDungeonPassage,
} from './worldPassages'

interface DungeonLinkLocation {
    description: WorldLocation
    navigation: NavigationService
}

export function validateDungeonLinks(
    locations: ReadonlyMap<string, DungeonLinkLocation>
): void {
    for (const [id, location] of locations) {
        const { navigation, description } = location
        const passages = navigation.grid.dungeonPassages ?? []
        validateFloor(description, passages)
        for (const passage of passages) {
            const target = locations.get(passage.destinationLocationId)
            if (
                target === undefined ||
                !validDirection(
                    description,
                    target.description,
                    passage.direction
                ) ||
                dungeonPassageDestination(passage, id, target.navigation) ===
                    undefined ||
                !validPlacement(navigation, passage, passages)
            ) {
                throw new Error(
                    `Invalid dungeon link from ${id} through ${passage.id}`
                )
            }
        }
    }
}

function validateFloor(
    location: WorldLocation,
    passages: readonly DungeonPassage[]
): void {
    if (location.biome !== 'dungeon') {
        return
    }
    const { floor, floorCount } = location
    if (
        floor === undefined ||
        floorCount === undefined ||
        !Number.isInteger(floor) ||
        !Number.isInteger(floorCount) ||
        floor < 1 ||
        floor > floorCount ||
        floorCount > 5 ||
        !passages.some(({ direction }) => direction === 'up') ||
        passages.length !== (floor === floorCount ? 1 : 2)
    ) {
        throw new Error(`Invalid dungeon floor ${location.id}`)
    }
}

function validDirection(
    from: WorldLocation,
    to: WorldLocation,
    direction: DungeonPassage['direction']
): boolean {
    if (from.biome !== 'dungeon') {
        return (
            direction === 'down' &&
            to.floor === 1 &&
            to.surfaceLocationId === from.id
        )
    }
    if (direction === 'up' && from.floor === 1) {
        return to.id === from.surfaceLocationId
    }
    return (
        from.floor !== undefined &&
        to.floor === from.floor + (direction === 'up' ? -1 : 1) &&
        from.dungeonId === to.dungeonId &&
        from.floorCount === to.floorCount &&
        from.surfaceLocationId === to.surfaceLocationId
    )
}

function validPlacement(
    navigation: NavigationService,
    passage: DungeonPassage,
    passages: readonly DungeonPassage[]
): boolean {
    return (
        !passages.some(
            (other) =>
                isInsideDungeonPassage(passage.arrival, other) ||
                (other !== passage &&
                    distance(other.position, passage.position) <=
                        other.triggerRadius + passage.triggerRadius)
        ) &&
        !navigation.isSolidTile(navigation.worldToTile(passage.position)) &&
        !navigation.isSolidTile(navigation.worldToTile(passage.arrival)) &&
        navigation.findPathWorld(passage.arrival, passage.position).length > 0
    )
}
