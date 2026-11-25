import type { DungeonSize, Vector2 } from '@my-game-ratata/contracts'

import { reconcileConstellationLevels } from './constellations'
import { effectiveMaxEnergy } from './effectiveResources'
import type { NavigationService } from './navigation'
import { createSkeleton, type SpawnedCharacter } from './spawns'

const masteryBySize = {
    small: { undead: 12, blade: 10 },
    medium: { undead: 20, blade: 16 },
    large: { undead: 28, blade: 22 },
}

export function createDungeonSkeletons(
    navigation: NavigationService,
    size: DungeonSize,
    positions: readonly Vector2[] = navigation.grid.dungeonSkeletons ?? [],
    id = navigation.grid.id
): SpawnedCharacter[] {
    return positions.map((position, index) => {
        const tile = navigation.worldToTile(position)
        if (navigation.isSolidTile(tile)) {
            throw new Error(`Dungeon skeleton inside a wall in ${id}`)
        }
        const spawn = createSkeleton(
            navigation,
            `_${id}_${String(index + 1)}`,
            tile,
            'none',
            true,
            false
        )
        const { character } = spawn
        const { masteries, constellations } = character.progression
        const levels = masteryBySize[size]
        masteries.undead.level = levels.undead
        masteries.blade.level = levels.blade
        for (const star of [
            'undead.arcane_frame',
            'undead.arcane_endurance',
            'undead.arcane_endurance2',
            'undead.hollow_bones',
            'undead.hollow_bones2',
            'undead.dense_bone',
            'undead.bone_windup',
            'undead.read_recovery',
            'undead.marrow_draw',
            'blade.tempo',
            'blade.tempo2',
            'blade.damage1',
            'blade.damage2',
            'blade.critical',
        ]) {
            constellations.opened.add(star)
        }
        if (size !== 'small') {
            constellations.opened.add('undead.feint')
        }
        if (size === 'large') {
            constellations.opened.add('undead.shatter_guard')
            constellations.opened.add('undead.dull_ring')
            constellations.opened.add('blade.critical2')
        }
        reconcileConstellationLevels(character)
        character.hp = character.maxHp
        character.energy = effectiveMaxEnergy(character)
        return spawn
    })
}
