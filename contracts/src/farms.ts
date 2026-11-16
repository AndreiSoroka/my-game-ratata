import type { Vector2 } from './index'
import { WORLD_LOCATION_DEFINITIONS } from './world.ts'

export interface FarmPlotDefinition {
    id: string
    locationId: string
    position: Vector2
    crop: 'wheat'
    name: string
    initiallyRipe?: boolean
}

export interface FarmSupplyChestDefinition {
    id: string
    locationId: string
    position: Vector2
}

const farmLocations = WORLD_LOCATION_DEFINITIONS.filter(
    (location) => location.biome === 'outskirts'
)

const farmBedPositions = [
    { x: 488, y: 744 },
    { x: 536, y: 744 },
    { x: 584, y: 744 },
]

export const FARM_PLOTS: readonly FarmPlotDefinition[] = farmLocations.flatMap(
    (location) =>
        farmBedPositions.map((position, index): FarmPlotDefinition => ({
            id: `farm_${location.id}_wheat_${String(index + 1)}`,
            locationId: location.id,
            position: { ...position },
            crop: 'wheat',
            name: `${location.name}: грядка ${String(index + 1)}`,
            initiallyRipe: index === 0,
        }))
)

export const FARM_SUPPLY_CHESTS: readonly FarmSupplyChestDefinition[] =
    farmLocations.map((location) => ({
        id: `farm_${location.id}_supply_chest`,
        locationId: location.id,
        position: { x: 472, y: 712 },
    }))
