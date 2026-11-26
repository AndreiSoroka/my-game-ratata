import { GameCharacter } from './character'
import { Mob1Controller } from './controllers'
import { effectiveMaxEnergy } from './effectiveResources'
import { initializeFatZombieConstellation } from './fatZombieConstellation'
import type { NavigationService } from './navigation'
import { mobSeed, type SpawnedCharacter } from './spawns'

export function createDungeonFatZombies(
    navigation: NavigationService,
    floor: number | undefined,
    worldSeed: string
): SpawnedCharacter[] {
    if (floor === undefined || floor < 2) {
        return []
    }
    const locationId = navigation.grid.id
    return (navigation.grid.dungeonFatZombies ?? []).map((position, index) => {
        if (navigation.isSolidTile(navigation.worldToTile(position))) {
            throw new Error(`Fat zombie inside a wall in ${locationId}`)
        }
        const id = `mob_fat_zombie_1_${locationId}_${String(index + 1)}`
        const character = new GameCharacter({
            id,
            nickname: 'Жирный зомби',
            archetype: 'fat_zombie',
            controllerKind: 'mob1',
            faction: 'monsters',
            locationId,
            spawnPosition: position,
            mortal: true,
            respawnPolicy: 'none',
            revivable: false,
        })
        initializeFatZombieConstellation(character, worldSeed, floor)
        character.energy = effectiveMaxEnergy(character)
        return {
            character,
            controller: new Mob1Controller(mobSeed(id, 29_479), {
                fleeWhenThreatened: false,
            }),
        }
    })
}
