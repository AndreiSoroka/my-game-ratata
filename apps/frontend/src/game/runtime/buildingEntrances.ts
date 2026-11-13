import type { Vector2, WorldObjectBounds } from '@my-game-ratata/contracts'

import type { MapBuilding } from './mapBuildings'

/** Public authored exterior landmarks, without render assets or interior inhabitants. */
export interface BuildingEntrance {
    id: string
    name: string
    entry: Vector2
    bounds: WorldObjectBounds
}

export class BuildingEntrances {
    private locationId: string | undefined
    private entrances: BuildingEntrance[] = []

    public replace(locationId: string, buildings: readonly MapBuilding[]): void {
        this.locationId = locationId
        this.entrances = buildings.map((building) => ({
            id: building.id,
            name: building.name,
            entry: { ...building.entry },
            bounds: {
                x: building.x,
                y: building.y,
                width: building.width,
                height: building.height,
            },
        }))
    }

    public read(locationId: string | undefined): BuildingEntrance[] {
        if (locationId !== this.locationId) return []
        return this.entrances.map((building) => ({
            ...building,
            entry: { ...building.entry },
            bounds: { ...building.bounds },
        }))
    }

    public clear(): void {
        this.locationId = undefined
        this.entrances = []
    }
}
