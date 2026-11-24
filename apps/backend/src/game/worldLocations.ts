import {
    CENTER_LOCATION_ID,
    GRID_SIZE,
    REGION_NAME,
    type Vector2,
    WORLD_LOCATION_DEFINITIONS,
    type WorldLocation,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { CityPortals, type PortalPassage } from './cityPortals'
import { clearCombatTransient } from './combatState'
import type { CorpseWallet } from './corpseWallet'
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
import { edgeExitDirection } from './regionalNavigation'
import { WorldInventory } from './worldInventory'
import type { WorldMaps } from './worldMaps'
import {
    canUsePassage,
    crossedDungeonPassage,
    nextLocationToward,
    stopForPassage,
    validateDungeonLink,
} from './worldPassages'

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
        for (const definition of [
            ...WORLD_LOCATION_DEFINITIONS,
            ...(maps?.dungeons ?? []),
        ]) {
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
        for (const dungeon of maps?.dungeons ?? []) {
            validateDungeonLink(
                this.get(dungeon.id).navigation,
                dungeon.surfaceLocationId
            )
            validateDungeonLink(
                this.get(dungeon.surfaceLocationId).navigation,
                dungeon.id
            )
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
        now = Date.now(),
        beforeMovement?: Vector2
    ): string | undefined {
        const current = this.get(character.locationId)
        const passage = crossedDungeonPassage(
            current.navigation,
            beforeMovement,
            character.position,
            intent
        )
        if (passage !== undefined) {
            return this.useDungeonPassage(
                character,
                passage.destinationLocationId,
                now
            )
        }
        return current.description.biome === 'dungeon'
            ? undefined
            : this.travelSurface(character, intent, current, now)
    }

    private travelSurface(
        character: GameCharacter,
        intent: Vector2,
        current: LocationState,
        now: number
    ) {
        const direction =
            npcModelRole(character.id) === 'city_coordinator'
                ? undefined
                : edgeExitDirection(
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
        if (!this.canTravel(character, next.description.id, now)) {
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

    private canTravel(
        character: GameCharacter,
        to: string,
        now: number
    ): boolean {
        return canPursuitTravel(character, to, now, (home) =>
            nextLocationToward(
                character.locationId,
                home,
                (id) => this.locations.get(id)?.navigation.grid.dungeonPassage
            )
        )
    }

    private useDungeonPassage(
        character: GameCharacter,
        destination: string,
        now: number
    ): string | undefined {
        const next = this.locations.get(destination)
        const target = next?.navigation.grid.dungeonPassage
        if (
            next === undefined ||
            target?.destinationLocationId !== character.locationId ||
            !canUsePassage(character, now) ||
            npcModelRole(character.id) === 'city_coordinator' ||
            forbiddenCityEntry(character, next) ||
            next.navigation.isSolidTile(
                next.navigation.worldToTile(target.arrival)
            ) ||
            !this.canTravel(character, destination, now)
        ) {
            return undefined
        }
        stopForPassage(character)
        const notice = this.transfer(character, next, target.arrival, now)
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
            !canUsePassage(character, now) ||
            !this.portals.reachable(character, passage)
        ) {
            return undefined
        }
        onPassage(passage)
        stopForPassage(character)
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
