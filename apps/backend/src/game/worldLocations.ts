import {
    CENTER_LOCATION_ID,
    type Vector2,
    WORLD_LOCATION_DEFINITIONS,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { CityPortals, type PortalPassage } from './cityPortals'
import { clearCombatTransient } from './combatState'
import type { CorpseWallet } from './corpseWallet'
import { validateDungeonLinks } from './dungeonLinks'
import type { DungeonPassage } from './dungeonMapData'
import type { NavigationService } from './navigation'
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
import { createLocationState, type LocationState } from './worldLocationState'
export type { LocationState } from './worldLocationState'
import type { WorldMaps } from './worldMaps'
import {
    canUsePassage,
    crossedDungeonPassage,
    dungeonPassageDestination,
    nextLocationToward,
    stopForPassage,
} from './worldPassages'

export const centerLocationId = CENTER_LOCATION_ID
export const dragonBoundaryMessage = 'А там дальше живут драконы'
export const cityEntryMessage =
    'Стража Новогорода не пропускает враждебных существ.'

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
            this.locations.set(
                definition.id,
                createLocationState(definition, center, wallet, maps)
            )
        }
        if (maps !== undefined && maps.dungeons.length > 0) {
            validateDungeonLinks(this.locations)
        }
    }

    public readonly nextLocationToward = (from: string, to: string) =>
        nextLocationToward(
            from,
            to,
            (id) => this.locations.get(id)?.navigation.grid.dungeonPassages
        )

    public readonly scoutingLocationId = (locationId: string) =>
        this.locations.get(locationId)?.description.dungeonId ?? locationId

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
            return this.useDungeonPassage(character, passage, now)
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
            this.nextLocationToward(character.locationId, home)
        )
    }

    private useDungeonPassage(
        character: GameCharacter,
        passage: DungeonPassage,
        now: number
    ): string | undefined {
        const destination = passage.destinationLocationId
        const next = this.locations.get(destination)
        const target =
            next === undefined
                ? undefined
                : dungeonPassageDestination(
                      passage,
                      character.locationId,
                      next.navigation
                  )
        if (
            next === undefined ||
            target === undefined ||
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
        const { floor, floorCount, name } = next.description
        return floor === undefined || floorCount === undefined
            ? `Локация: ${name}`
            : `${name} · этаж ${String(floor)} из ${String(floorCount)}`
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
