import {
    CENTER_LOCATION_ID,
    GRID_SIZE,
    REGION_NAME,
    type Vector2,
    WORLD_LOCATION_DEFINITIONS,
    type WorldLocation,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { CorpseWallet } from './corpseWallet'
import { loadNavigationService, NavigationService } from './navigation'
import { returnFromPursuit } from './pursuitState'
import { canPursuitTravel, recordPursuitEntry } from './pursuitTravel'
import { WorldInventory } from './worldInventory'
import type { WorldMaps } from './worldMaps'

export const centerLocationId = CENTER_LOCATION_ID
export const dragonBoundaryMessage = 'А там дальше живут драконы'
export const cityEntryMessage =
    'Стража Новогорода не пропускает враждебных существ.'

export interface LocationState {
    description: WorldLocation
    inventory: WorldInventory
    navigation: NavigationService
}

export class WorldLocations {
    public readonly serverEpoch: string | undefined
    public readonly locations = new Map<string, LocationState>()
    private readonly blockedEdges = new Map<string, string>()

    public constructor(
        center: NavigationService,
        wallet?: CorpseWallet,
        private readonly maps?: WorldMaps
    ) {
        this.serverEpoch = maps?.epoch
        for (const definition of WORLD_LOCATION_DEFINITIONS) {
            const { id } = definition
            const navigation =
                id === CENTER_LOCATION_ID
                    ? center
                    : maps !== undefined
                      ? maps.navigation(id)
                      : center.grid.id === 'map1' ||
                          center.grid.id === CENTER_LOCATION_ID
                        ? loadNavigationService(id)
                        : new NavigationService({ ...center.grid, id })
            this.locations.set(id, {
                description: {
                    ...definition,
                    columns: GRID_SIZE,
                    rows: GRID_SIZE,
                    regionName: REGION_NAME,
                    map: { ...navigation.summary, id },
                },
                inventory: new WorldInventory(navigation, id, wallet),
                navigation,
            })
        }
    }

    public get(id = centerLocationId): LocationState {
        const location = this.locations.get(id)
        if (location === undefined) {
            throw new Error(`Unknown location: ${id}`)
        }
        return location
    }

    public mapAsset(epoch: string, locationId: string) {
        return this.maps?.asset(epoch, locationId)
    }

    public closeChestViews(actorId: string): void {
        for (const location of this.locations.values()) {
            location.inventory.containers.close(actorId)
        }
    }

    public updateChestViews(
        characters: ReadonlyMap<string, GameCharacter>,
        now: number
    ): void {
        for (const location of this.locations.values()) {
            location.inventory.containers.update(characters, now)
        }
    }

    private adjacentLocation(
        current: LocationState,
        direction: Vector2
    ): LocationState | undefined {
        const next = WORLD_LOCATION_DEFINITIONS.find(
            (definition) =>
                definition.column ===
                    current.description.column + direction.x &&
                definition.row === current.description.row + direction.y
        )
        return next === undefined ? undefined : this.locations.get(next.id)
    }

    public travel(
        character: GameCharacter,
        intent: Vector2,
        now = Date.now()
    ): string | undefined {
        const current = this.get(character.locationId)
        const direction = exitDirection(
            character.position,
            intent,
            current.navigation
        )
        if (direction === undefined) {
            this.blockedEdges.delete(character.id)
            return undefined
        }
        const next = this.adjacentLocation(current, direction)
        if (next === undefined || forbiddenCityEntry(character, next)) {
            returnFromPursuit(character)
            const edge = `${character.locationId}:${String(direction.x)}:${String(direction.y)}`
            if (this.blockedEdges.get(character.id) === edge) {
                return undefined
            }
            this.blockedEdges.set(character.id, edge)
            return next === undefined ? dragonBoundaryMessage : cityEntryMessage
        }
        const summary = next.navigation.summary
        if (!canPursuitTravel(character, next.description.id, now)) {
            return undefined
        }
        const margin = summary.tileWidth * 2.5
        character.position = {
            x:
                direction.x > 0
                    ? margin
                    : direction.x < 0
                      ? summary.worldWidth - margin
                      : character.position.x,
            y:
                direction.y > 0
                    ? margin
                    : direction.y < 0
                      ? summary.worldHeight - margin
                      : character.position.y,
        }
        this.closeChestViews(character.id)
        character.locationId = next.description.id
        recordPursuitEntry(character, now)
        character.clearPath()
        character.clearPendingAttackHit()
        character.attackZones = []
        character.attackZoneUntil = 0
        character.velocity = { x: 0, y: 0 }
        this.blockedEdges.delete(character.id)
        return `Локация: ${next.description.name}`
    }
}

function forbiddenCityEntry(
    character: GameCharacter,
    next: LocationState
): boolean {
    return next.description.biome === 'city' && character.faction === 'monsters'
}

function exitDirection(
    position: Vector2,
    intent: Vector2,
    navigation: NavigationService
): Vector2 | undefined {
    const { tileWidth, tileHeight, worldWidth, worldHeight } =
        navigation.summary
    const epsilon = 0.01
    if (intent.x < 0 && position.x <= tileWidth / 2 + epsilon) {
        return { x: -1, y: 0 }
    }
    if (intent.x > 0 && position.x >= worldWidth - tileWidth / 2 - epsilon) {
        return { x: 1, y: 0 }
    }
    if (intent.y < 0 && position.y <= tileHeight / 2 + epsilon) {
        return { x: 0, y: -1 }
    }
    if (intent.y > 0 && position.y >= worldHeight - tileHeight / 2 - epsilon) {
        return { x: 0, y: 1 }
    }
    return undefined
}
