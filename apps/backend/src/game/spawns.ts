import type { Vector2 } from '@my-game-ratata/contracts'

import { type GameCharacter } from './character'
import { GameCharacter as Character } from './character'
import { type CharacterController, Mob1Controller } from './controllers'
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
        id: 'mob_skeleton_1',
        nickname: 'Skeleton',
        spawnPosition: navigation.tileToWorld({ x: 10, y: 5 }),
    })

    return {
        character: skeleton,
        controller: new Mob1Controller(13_371),
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
