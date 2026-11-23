import type { MapSummary } from './index'

export const GRID_SIZE = 5
export const CENTER_LOCATION_ID = 'map-2-2'
export const WESTERN_RUINS_LOCATION_ID = 'map-0-2'
export const REGION_NAME = 'Земли Новогорода'
export type WorldBiome = 'city' | 'outskirts' | 'wilds'
export type WorldDirection = 'north' | 'east' | 'south' | 'west'
export const WORLD_DIRECTIONS: Readonly<
    Record<WorldDirection, { x: number; y: number }>
> = {
    north: { x: 0, y: -1 },
    east: { x: 1, y: 0 },
    south: { x: 0, y: 1 },
    west: { x: -1, y: 0 },
}

export interface WorldLocationDefinition {
    municipalQuestGold?: number
    id: string
    name: string
    column: number
    row: number
    dangerLevel: number
    biome: WorldBiome
}

export interface WorldLocation extends WorldLocationDefinition {
    columns: number
    rows: number
    regionName: string
    map: MapSummary
}

const locationNames = [
    [
        'Волчьи выси',
        'Мёртвый бор',
        'Северная застава',
        'Костяной овраг',
        'Сумрачные утёсы',
    ],
    [
        'Гнилые топи',
        'Старый лес',
        'Северные предместья',
        'Забытые курганы',
        'Каменный разлом',
    ],
    [
        'Западные руины',
        'Западные поля',
        'Новогород',
        'Восточные сады',
        'Восточный тракт',
    ],
    [
        'Чёрная трясина',
        'Пастушьи холмы',
        'Южные хутора',
        'Тихие пруды',
        'Заброшенный форт',
    ],
    [
        'Край изгнанников',
        'Пепельная пустошь',
        'Южная застава',
        'Дальний карьер',
        'Проклятая чаща',
    ],
]

export const WORLD_LOCATION_DEFINITIONS: readonly WorldLocationDefinition[] =
    locationNames.flatMap((names, row) =>
        names.map((name, column) => {
            const dangerLevel = Math.abs(column - 2) + Math.abs(row - 2)
            return {
                id: worldLocationId(column, row),
                name,
                column,
                row,
                dangerLevel,
                ...(dangerLevel === 0 ? { municipalQuestGold: 300 } : {}),
                biome:
                    dangerLevel === 0
                        ? 'city'
                        : dangerLevel === 1
                          ? 'outskirts'
                          : 'wilds',
            }
        })
    )

export function worldLocationId(column: number, row: number): string {
    return `map-${String(column)}-${String(row)}`
}

export function getWorldLocationDefinition(
    id: string
): WorldLocationDefinition | undefined {
    return WORLD_LOCATION_DEFINITIONS.find((location) => location.id === id)
}

export function worldLocationNeighbor(
    id: string,
    direction: WorldDirection
): WorldLocationDefinition | undefined {
    const current = getWorldLocationDefinition(id)
    const offset = WORLD_DIRECTIONS[direction]
    return current === undefined
        ? undefined
        : WORLD_LOCATION_DEFINITIONS.find(
              (location) =>
                  location.column === current.column + offset.x &&
                  location.row === current.row + offset.y
          )
}

export interface EncounterDifficulty {
    enemyCount: number
    hpMultiplier: number
    damageMultiplier: number
}

export const ENCOUNTER_DIFFICULTIES: readonly EncounterDifficulty[] = [
    { enemyCount: 0, hpMultiplier: 1, damageMultiplier: 1 },
    { enemyCount: 3, hpMultiplier: 2.2, damageMultiplier: 1.8 },
    { enemyCount: 4, hpMultiplier: 2.8, damageMultiplier: 2.2 },
    { enemyCount: 5, hpMultiplier: 3.4, damageMultiplier: 2.6 },
    { enemyCount: 6, hpMultiplier: 4, damageMultiplier: 3 },
]

export const WILDERNESS_AGGRO_POLICY = {
    sightRadius: 112,
    alertRadius: 160,
    alertCooldownMs: 1_000,
    alertDurationMs: 4_000,
    pursuitRadius: 240,
    spawnLeashRadius: 320,
} as const

export function encounterDifficulty(dangerLevel: number): EncounterDifficulty {
    return (
        ENCOUNTER_DIFFICULTIES[dangerLevel] ?? {
            enemyCount: 0,
            hpMultiplier: 1,
            damageMultiplier: 1,
        }
    )
}
