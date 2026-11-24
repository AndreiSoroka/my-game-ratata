import {
    CENTER_LOCATION_ID,
    GRID_SIZE,
    REGION_NAME,
    type Vector2,
    WORLD_LOCATION_DEFINITIONS,
    type WorldLocation,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { cancelCharacterControl } from './characterControl'
import { CityPortals, type PortalPassage } from './cityPortals'
import { sparkBlocksTravel } from './combatMovement'
import { clearCombatTransient } from './combatState'
import type { CorpseWallet } from './corpseWallet'
import { available } from './crimeRules'
import { magicBlocksMovement } from './magicState'
import { cancelMovementMode } from './movementActions'
import { loadNavigationService, NavigationService } from './navigation'
import { npcModelRole } from './npcRoster'
import { markPositionDiscontinuity } from './positionDiscontinuity'
import { returnFromPursuit } from './pursuitState'
import {
    canPursuitTravel,
    pursuitPortalHomecoming,
    recordPursuitEntry,
    recordPursuitPortalEntry,
} from './pursuitTravel'
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
    public readonly portals = new CityPortals(this.locations)
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
        const direction = characterExitDirection(
            character,
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
        const position = {
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
        const notice = this.transfer(character, next, position, now)
        recordPursuitEntry(character, now)
        return notice
    }

    public usePortal(
        character: GameCharacter,
        endpointId: string,
        now: number,
        onPassage: (passage: PortalPassage) => void
    ): string | undefined {
        const passage = this.portals.passage(
            endpointId,
            character.locationId,
            now
        )
        if (
            passage === undefined ||
            (npcModelRole(character.id) === 'city_coordinator' &&
                passage.destination.locationId !== CENTER_LOCATION_ID) ||
            !available(character) ||
            character.trainingTarget !== undefined ||
            character.stunUntil > now ||
            character.isActionLocked(now) ||
            sparkBlocksTravel(character) ||
            character.combat.defensiveStance ||
            magicBlocksMovement(character, now) ||
            !this.portals.reachable(character, passage)
        ) {
            return undefined
        }
        onPassage(passage)
        cancelCharacterControl(character)
        character.setMoveInput({ x: 0, y: 0 })
        cancelMovementMode(character)
        const next = this.get(passage.destination.locationId)
        const notice = this.transfer(
            character,
            next,
            passage.destination.position,
            now
        )
        recordPursuitPortalEntry(character, passage, now)
        return notice
    }

    private transfer(
        character: GameCharacter,
        next: LocationState,
        position: Vector2,
        now: number
    ): string {
        this.closeChestViews(character.id)
        markPositionDiscontinuity(character)
        character.clearPendingAttackHit()
        character.position = { ...position }
        character.locationId = next.description.id
        character.clearPath()
        clearCombatTransient(character, now)
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
    return (
        next.description.biome === 'city' &&
        character.faction === 'monsters' &&
        !pursuitPortalHomecoming(character, next.description.id)
    )
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

function characterExitDirection(
    character: GameCharacter,
    intent: Vector2,
    navigation: NavigationService
): Vector2 | undefined {
    return npcModelRole(character.id) === 'city_coordinator'
        ? undefined
        : exitDirection(character.position, intent, navigation)
}
