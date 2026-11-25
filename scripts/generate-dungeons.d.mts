export interface DungeonDefinition {
    id: string
    name: string
    size: 'small' | 'medium' | 'large'
    surfaceLocationId: string
    dangerLevel: number
    towerVariant: number
    floorCount: number
}

export interface DungeonFloorDefinition extends DungeonDefinition {
    dungeonId: string
    floor: number
}

export function generateDungeonRegion(
    seed: string | number,
    surfaceLocations: readonly { id: string; dangerLevel: number }[]
): DungeonDefinition[]

export function generateDungeonFloors(
    dungeon: DungeonDefinition
): DungeonFloorDefinition[]

export function generateDungeonMap(
    definition: DungeonDefinition | DungeonFloorDefinition,
    seed: string | number,
    regionName: string
): unknown
