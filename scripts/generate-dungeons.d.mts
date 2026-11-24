export interface DungeonDefinition {
    id: string
    name: string
    size: 'small' | 'medium' | 'large'
    surfaceLocationId: string
    dangerLevel: number
    towerVariant: number
}

export function generateDungeonRegion(
    seed: string | number,
    surfaceLocations: readonly { id: string; dangerLevel: number }[]
): DungeonDefinition[]

export function generateDungeonMap(
    definition: DungeonDefinition,
    seed: string | number,
    regionName: string
): unknown
