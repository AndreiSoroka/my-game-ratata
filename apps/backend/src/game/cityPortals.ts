import {
    PORTAL_INTERACTION_TILES,
    PORTAL_LIFETIME_MS,
    type PortalEndpointSnapshot,
    type Vector2,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { distance } from './math'
import type { NavigationService } from './navigation'
import { regionalRoute } from './regionalNavigation'
import type { LocationState } from './worldLocations'

export interface PortalPassage {
    source: PortalEndpointSnapshot
    destination: PortalEndpointSnapshot
}

export class CityPortals {
    private readonly passages = new Map<string, PortalPassage>()
    private sequence = 0

    public constructor(
        private readonly locations: ReadonlyMap<string, LocationState>
    ) {}

    public canOpen(actor: GameCharacter, now: number): boolean {
        return this.placement(actor, now) !== undefined
    }

    public open(actor: GameCharacter, now: number): PortalPassage | undefined {
        const placement = this.placement(actor, now)
        if (placement === undefined) {
            return undefined
        }
        const { source, city, position } = placement
        const id = `portal-${String(++this.sequence)}`
        const expiresAt = now + PORTAL_LIFETIME_MS
        const origin: PortalEndpointSnapshot = {
            id: `${id}-field`,
            locationId: source.description.id,
            position: { ...actor.position },
            destinationLocationId: city.description.id,
            destinationName: city.description.name,
            expiresAt,
        }
        const arrival: PortalEndpointSnapshot = {
            id: `${id}-city`,
            locationId: city.description.id,
            position: { ...position },
            destinationLocationId: source.description.id,
            destinationName: source.description.name,
            expiresAt,
        }
        const passage = { source: origin, destination: arrival }
        this.passages.set(origin.id, passage)
        this.passages.set(arrival.id, { source: arrival, destination: origin })
        return passage
    }

    public passage(
        id: string,
        locationId: string,
        now: number
    ): PortalPassage | undefined {
        const found = this.passages.get(id)
        return found?.source.locationId === locationId &&
            now < found.source.expiresAt
            ? found
            : undefined
    }

    public reachable(actor: GameCharacter, passage: PortalPassage): boolean {
        const navigation = this.locations.get(
            passage.source.locationId
        )?.navigation
        const destinationNav = this.locations.get(
            passage.destination.locationId
        )?.navigation
        return (
            navigation !== undefined &&
            destinationNav !== undefined &&
            distance(actor.position, passage.source.position) <=
                portalReach(navigation) &&
            navigation.hasLineOfSight(
                actor.position,
                passage.source.position
            ) &&
            walkable(destinationNav, passage.destination.position)
        )
    }

    public snapshot(locationId: string, now: number): PortalEndpointSnapshot[] {
        return [...this.passages.values()]
            .map(({ source }) => source)
            .filter(
                (portal) =>
                    portal.locationId === locationId && now < portal.expiresAt
            )
            .map((portal) => ({ ...portal, position: { ...portal.position } }))
    }

    public expire(now: number): void {
        for (const [id, { source }] of this.passages) {
            if (now >= source.expiresAt) {
                this.passages.delete(id)
            }
        }
    }

    private placement(actor: GameCharacter, now: number) {
        const source = this.locations.get(actor.locationId)
        if (
            source === undefined ||
            source.description.biome === 'city' ||
            !walkable(source.navigation, actor.position) ||
            !this.hasSpace(
                source.description.id,
                source.navigation,
                actor.position,
                now
            )
        ) {
            return undefined
        }
        const city = this.nearestCity(source.description.id)
        if (city === undefined) {
            return undefined
        }
        const position = cityPortalPositions(city.navigation).find(
            (point) =>
                walkable(city.navigation, point) &&
                this.hasSpace(city.description.id, city.navigation, point, now)
        )
        return position === undefined ? undefined : { source, city, position }
    }

    private nearestCity(locationId: string): LocationState | undefined {
        return [...this.locations.values()]
            .filter(({ description }) => description.biome === 'city')
            .flatMap((city) => {
                const route = regionalRoute(locationId, city.description.id)
                return route === undefined
                    ? []
                    : [{ city, hops: route.length - 1 }]
            })
            .sort((a, b) =>
                a.hops === b.hops
                    ? a.city.description.id.localeCompare(b.city.description.id)
                    : a.hops - b.hops
            )[0]?.city
    }

    private hasSpace(
        locationId: string,
        navigation: NavigationService,
        point: Vector2,
        now: number
    ): boolean {
        const separation =
            Math.min(navigation.grid.tileWidth, navigation.grid.tileHeight) * 2
        for (const { source } of this.passages.values()) {
            if (
                source.locationId === locationId &&
                now < source.expiresAt &&
                distance(source.position, point) < separation
            ) {
                return false
            }
        }
        return true
    }
}

export function portalReach(navigation: NavigationService): number {
    return (
        PORTAL_INTERACTION_TILES *
        Math.min(navigation.grid.tileWidth, navigation.grid.tileHeight)
    )
}

function walkable(navigation: NavigationService, point: Vector2): boolean {
    return !navigation.isSolidTile(navigation.worldToTile(point))
}

function cityPortalPositions(navigation: NavigationService): Vector2[] {
    const anchors = navigation.grid.cityAnchors
    if (anchors !== undefined) {
        return Object.entries(anchors)
            .filter(([id]) => id.startsWith('portal.'))
            .sort(([first], [second]) => first.localeCompare(second))
            .map(([, point]) => point)
    }
    const { width, height } = navigation.grid
    return Array.from({ length: 4 }, (_, index) =>
        navigation.tileToWorld({
            x: Math.floor(width / 2) + (index % 2) * 2,
            y: Math.floor(height / 2) + Math.floor(index / 2) * 2,
        })
    )
}
