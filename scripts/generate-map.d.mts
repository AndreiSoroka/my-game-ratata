import type { DungeonDefinition } from './generate-dungeons.mjs'

export type CityLayoutStyle = 'grid' | 'organic' | 'ring'
export interface GeneratedLocationDefinition {
    id: string
    name: string
    column: number
    row: number
    biome: string
    dangerLevel: number
}
export function hashSeed(value: string): number
export function generateCity(
    seed: string | number,
    style?: CityLayoutStyle,
    dungeonEntrance?: DungeonDefinition
): unknown
export function generateWorldMap(
    definition: GeneratedLocationDefinition,
    options?: {
        seed?: string | number
        ashRefugeSeed?: string | number
        style?: CityLayoutStyle
        forceCityFallback?: boolean
        dungeonEntrance?: DungeonDefinition
    }
): unknown
