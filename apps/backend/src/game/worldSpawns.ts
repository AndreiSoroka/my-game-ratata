import {
    encounterDifficulty,
    GRAVE_MAX_LIVING,
    type WorldLocationDefinition,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { graveChildTile, slimeHabitatTile } from './encounterPlacement'
import type { NavigationService } from './navigation'
import { createSkeleton, createSlime, type SpawnedCharacter } from './spawns'

const encounterTiles = [
    { x: 60, y: 36 },
    { x: 62, y: 37 },
    { x: 58, y: 38 },
    { x: 55, y: 50 },
    { x: 57, y: 49 },
    { x: 53, y: 48 },
]

export interface LocationEnemy extends SpawnedCharacter {
    graveSourceId?: string
}

export function createLocationEnemies(
    navigation: NavigationService,
    location: WorldLocationDefinition
): LocationEnemy[] {
    const difficulty = encounterDifficulty(location.dangerLevel)
    if (difficulty.enemyCount === 0) {
        return []
    }
    const result: LocationEnemy[] = []
    const graves = navigation.grid.encounters?.graves ?? []
    const reserveRevival = navigation.grid.encounters?.ashRefuge !== undefined
    for (const [index, tile] of encounterTiles
        .slice(0, difficulty.enemyCount)
        .entries()) {
        const suffix = `_${location.id}${index < 2 ? '' : `_${String(index + 1)}`}`
        const occupied = result.map(({ character }) => character.position)
        let spawn: LocationEnemy
        if (index % 2 === 0) {
            const source = graves[Math.floor(index / 2) % graves.length]
            if (source !== undefined) {
                if (
                    result.filter((entry) => entry.graveSourceId === source.id)
                        .length >= GRAVE_MAX_LIVING
                ) {
                    continue
                }
                const sourceTile = graveChildTile(navigation, source, occupied)
                if (sourceTile === undefined) {
                    continue
                }
                spawn = {
                    ...createSkeleton(
                        navigation,
                        suffix,
                        sourceTile,
                        'none',
                        reserveRevival
                    ),
                    graveSourceId: source.id,
                }
            } else {
                spawn = createSkeleton(navigation, suffix, tile)
            }
        } else {
            spawn = createSlime(
                navigation,
                suffix,
                slimeHabitatTile(navigation, tile, occupied)
            )
        }
        applyEncounterDifficulty(spawn.character, location)
        result.push(spawn)
    }
    return result
}

export function applyEncounterDifficulty(
    character: GameCharacter,
    location: WorldLocationDefinition
): void {
    character.tags.add(`danger.${String(location.dangerLevel)}`)
    if (character.archetype === 'skeleton') {
        return
    }
    const difficulty = encounterDifficulty(location.dangerLevel)
    character.config.combat.maxHp = Math.ceil(
        character.config.combat.maxHp * difficulty.hpMultiplier
    )
    character.maxHp = character.config.combat.maxHp
    character.hp = character.maxHp
    character.config.combat.damageMultiplier = difficulty.damageMultiplier
}
