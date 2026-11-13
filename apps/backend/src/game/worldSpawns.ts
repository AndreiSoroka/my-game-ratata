import {
    encounterDifficulty,
    type WorldLocationDefinition,
} from '@my-game-ratata/contracts'

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

export function createLocationEnemies(
    navigation: NavigationService,
    location: WorldLocationDefinition
): SpawnedCharacter[] {
    const difficulty = encounterDifficulty(location.dangerLevel)
    if (difficulty.enemyCount === 0) {
        return []
    }
    return encounterTiles.slice(0, difficulty.enemyCount).map((tile, index) => {
        const suffix = `_${location.id}${index < 2 ? '' : `_${String(index + 1)}`}`
        const spawn =
            index % 2 === 0
                ? createSkeleton(navigation, suffix, tile)
                : createSlime(navigation, suffix, tile)
        const character = spawn.character
        character.config.combat.maxHp = Math.ceil(
            character.config.combat.maxHp * difficulty.hpMultiplier
        )
        character.maxHp = character.config.combat.maxHp
        character.hp = character.maxHp
        character.config.combat.damageMultiplier = difficulty.damageMultiplier
        character.tags.add(`danger.${String(location.dangerLevel)}`)
        return spawn
    })
}
