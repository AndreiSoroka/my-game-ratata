import type { Vector2 } from '@my-game-ratata/contracts'

import { type GameCharacter } from './character'
import { GameCharacter as Character } from './character'
import { type CharacterController, Mob1Controller } from './controllers'
import { createItemInstance, equipDirect } from './inventory'
import type { NavigationService, TileCoordinate } from './navigation'

export interface SpawnedCharacter {
    character: GameCharacter
    controller: CharacterController
}

export function createSkeleton(
    navigation: NavigationService
): SpawnedCharacter {
    const skeleton = new Character({
        archetype: 'skeleton',
        controllerKind: 'mob1',
        faction: 'monsters',
        id: 'mob_skeleton_1',
        nickname: 'Skeleton',
        spawnPosition: navigation.tileToWorld({ x: 10, y: 5 }),
    })

    equipDirect(skeleton.equipment, createItemInstance('old_sword'))

    return {
        character: skeleton,
        controller: new Mob1Controller(13_371, { fleeWhenThreatened: false }),
    }
}

export function createSlime(navigation: NavigationService): SpawnedCharacter {
    const slime = new Character({
        archetype: 'slime',
        controllerKind: 'mob1',
        faction: 'monsters',
        id: 'mob_slime_1',
        nickname: 'Slime',
        spawnPosition: navigation.tileToWorld({ x: 11, y: 5 }),
    })

    return {
        character: slime,
        controller: new Mob1Controller(41_337, { fleeWhenThreatened: true }),
    }
}

export function playerSpawn(
    navigation: NavigationService,
    index: number
): Vector2 {
    const spawnTiles: TileCoordinate[] = [
        { x: 1, y: 1 },
        { x: 1, y: 8 },
        { x: 13, y: 8 },
        { x: 7, y: 9 },
    ]
    const tile = spawnTiles[(index - 1) % spawnTiles.length]

    return navigation.tileToWorld(tile ?? { x: 1, y: 1 })
}
