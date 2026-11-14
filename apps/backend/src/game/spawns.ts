import {
    CENTER_LOCATION_ID,
    getWorldLocationDefinition,
    type Vector2,
} from '@my-game-ratata/contracts'

import { type GameCharacter } from './character'
import { GameCharacter as Character } from './character'
import {
    type CharacterController,
    Mob1Controller,
    NetworkPlayerController,
} from './controllers'
import { createItemInstance, equipDirect } from './inventory'
import type { NavigationService, TileCoordinate } from './navigation'

export interface SpawnedCharacter {
    character: GameCharacter
    controller: CharacterController
}

export function createSkeleton(
    navigation: NavigationService,
    idSuffix = '',
    spawnTile?: TileCoordinate,
    respawnPolicy: 'automatic' | 'none' = 'automatic'
): SpawnedCharacter {
    const skeleton = new Character({
        archetype: 'skeleton',
        creatureType: 'undead',
        controllerKind: 'mob1',
        respawnPolicy,
        locationId: spawnLocationId(navigation),
        faction: 'monsters',
        id: `mob_skeleton_1${idSuffix}`,
        nickname: 'Skeleton',
        spawnPosition: spawnPosition(
            navigation,
            spawnTile ?? { x: 10, y: 5 },
            spawnTile ?? { x: 60, y: 36 }
        ),
    })

    equipDirect(skeleton.equipment, createItemInstance('old_sword'))

    return {
        character: skeleton,
        controller: new Mob1Controller(mobSeed(skeleton.id, 13_371), {
            fleeWhenThreatened: false,
        }),
    }
}

export function createSlime(
    navigation: NavigationService,
    idSuffix = '',
    spawnTile?: TileCoordinate
): SpawnedCharacter {
    const slime = new Character({
        archetype: 'slime',
        creatureType: 'ooze',
        controllerKind: 'mob1',
        locationId: spawnLocationId(navigation),
        faction: 'monsters',
        id: `mob_slime_1${idSuffix}`,
        nickname: 'Slime',
        spawnPosition: spawnPosition(
            navigation,
            { x: 11, y: 5 },
            spawnTile ?? { x: 55, y: 50 }
        ),
    })

    return {
        character: slime,
        controller: new Mob1Controller(mobSeed(slime.id, 41_337), {
            fleeWhenThreatened: true,
        }),
    }
}

function mobSeed(id: string, base: number): number {
    let seed = base
    for (const char of id) {
        seed = Math.imul(seed ^ char.charCodeAt(0), 16_777_619) >>> 0
    }
    return seed
}

export function createFriendlyGirl(
    navigation: NavigationService,
    idSuffix = ''
): SpawnedCharacter {
    const girl = new Character({
        archetype: 'human',
        creatureType: 'humanoid',
        controllerKind: 'scripted',
        locationId: spawnLocationId(navigation),
        faction: 'peaceful',
        id: `npc_friendly_girl_1${idSuffix}`,
        nickname: 'Mira',
        spawnPosition: spawnPosition(
            navigation,
            { x: 4, y: 2 },
            { x: 40, y: 28 }
        ),
        visualId: 'female_player',
    })

    return {
        character: girl,
        controller: new NetworkPlayerController(),
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

    const largeTiles: TileCoordinate[] = [
        { x: 42, y: 46 },
        { x: 43, y: 46 },
        { x: 41, y: 46 },
        { x: 42, y: 48 },
    ]
    return spawnPosition(
        navigation,
        tile ?? { x: 1, y: 1 },
        largeTiles[(index - 1) % largeTiles.length] ?? { x: 42, y: 46 }
    )
}

function spawnPosition(
    navigation: NavigationService,
    small: TileCoordinate,
    large: TileCoordinate
): Vector2 {
    const { width, height } = navigation.grid
    const desired = width >= 64 && height >= 64 ? large : small
    const tile = {
        x: Math.max(0, Math.min(width - 1, desired.x)),
        y: Math.max(0, Math.min(height - 1, desired.y)),
    }
    if (!navigation.isSolidTile(tile)) {
        return navigation.tileToWorld(tile)
    }
    for (let radius = 1; radius < Math.max(width, height); radius += 1) {
        for (let dy = -radius; dy <= radius; dy += 1) {
            for (let dx = -radius; dx <= radius; dx += 1) {
                const candidate = { x: tile.x + dx, y: tile.y + dy }
                if (!navigation.isSolidTile(candidate)) {
                    return navigation.tileToWorld(candidate)
                }
            }
        }
    }
    throw new Error('Map has no walkable spawn tile')
}

function spawnLocationId(navigation: NavigationService): string {
    return (
        getWorldLocationDefinition(navigation.grid.id)?.id ?? CENTER_LOCATION_ID
    )
}
