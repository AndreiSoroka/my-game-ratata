import {
    CENTER_LOCATION_ID,
    GRID_SIZE,
    REGION_NAME,
    WORLD_LOCATION_DEFINITIONS,
} from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { createAdventureResourceNodes } from '../src/game/adventureResources'
import { GameCharacter } from '../src/game/character'
import { CHARACTER_CONFIG } from '../src/game/characterConfig'
import { NavigationService } from '../src/game/navigation'
import { createSkeleton } from '../src/game/spawns'
import { cityEntryMessage, WorldLocations } from '../src/game/worldLocations'
import { createLocationEnemies } from '../src/game/worldSpawns'

function openMap(id = 'region-test'): NavigationService {
    return new NavigationService({
        id,
        width: 96,
        height: 80,
        tileWidth: 16,
        tileHeight: 16,
        solid: new Array<boolean>(96 * 80).fill(false),
        solidLayerNames: [],
    })
}

describe('Novogorod region definition and danger', () => {
    it('has one safe center, twenty-four outer locations and material sources everywhere', () => {
        const world = new WorldLocations(openMap())
        expect(world.locations.size).toBe(GRID_SIZE * GRID_SIZE)
        expect(world.get().description).toMatchObject({
            id: CENTER_LOCATION_ID,
            name: 'Новогород',
            regionName: REGION_NAME,
            dangerLevel: 0,
            biome: 'city',
        })
        expect(
            WORLD_LOCATION_DEFINITIONS.filter(
                (location) => location.dangerLevel === 0
            )
        ).toHaveLength(1)
        const nodes = createAdventureResourceNodes()
        expect(nodes).toHaveLength(75)
        for (const location of WORLD_LOCATION_DEFINITIONS) {
            expect(location.dangerLevel).toBe(
                Math.abs(location.column - 2) + Math.abs(location.row - 2)
            )
            expect(
                nodes.filter((node) => node.locationId === location.id)
            ).toHaveLength(3)
            if (location.dangerLevel === 0) {
                expect(createLocationEnemies(openMap(), location)).toEqual([])
            }
        }
    })
})

describe('wilderness encounter tiers and travel', () => {
    it('increases population and slime strength with distance while skeletons start with identical stats', () => {
        let previousCount = 0
        let previousSlimeHp = 0
        let previousSlimeDamage = 0
        const starterSkeletonStats =
            createSkeleton(openMap()).character.snapshot(0).stats
        for (const dangerLevel of [1, 2, 3, 4]) {
            const location = WORLD_LOCATION_DEFINITIONS.find(
                (candidate) => candidate.dangerLevel === dangerLevel
            )
            if (location === undefined) {
                throw new Error('Missing danger band')
            }
            const monsters = createLocationEnemies(
                openMap(location.id),
                location
            )
            const skeletons = monsters.filter(
                ({ character }) => character.archetype === 'skeleton'
            )
            const slime = monsters.find(
                ({ character }) => character.archetype === 'slime'
            )?.character
            if (slime === undefined) {
                throw new Error('Missing slime')
            }
            const slimeStats = slime.snapshot(0).stats
            expect(monsters.length).toBeGreaterThan(previousCount)
            expect(skeletons.length).toBeGreaterThan(0)
            for (const { character } of skeletons) {
                expect(character.maxHp).toBe(50)
                expect(character.hp).toBe(50)
                expect(character.snapshot(0).stats).toEqual(
                    starterSkeletonStats
                )
            }
            expect(slime.maxHp).toBeGreaterThan(previousSlimeHp)
            expect(slimeStats.minDamage).toBeGreaterThan(previousSlimeDamage)
            previousCount = monsters.length
            previousSlimeHp = slime.maxHp
            previousSlimeDamage = slimeStats.minDamage
        }
        expect(CHARACTER_CONFIG.skeleton.combat.maxHp).toBe(10)
        expect(
            CHARACTER_CONFIG.skeleton.combat.damageMultiplier
        ).toBeUndefined()
    })

    it('retains spawn origin and starter stats when a skeleton respawns after traveling', () => {
        const location = WORLD_LOCATION_DEFINITIONS[0]
        if (location === undefined) {
            throw new Error('Missing location')
        }
        const character = createLocationEnemies(
            openMap(location.id),
            location
        )[0]?.character
        if (character === undefined) {
            throw new Error('Missing skeleton')
        }
        const maxHp = character.maxHp
        const damage = character.snapshot(0).stats.minDamage
        character.locationId = 'map-1-0'
        character.position = { x: 40, y: 40 }
        character.applyDamage(character.hp, 1_000)
        character.queueRespawn(1_000, 15_000)
        character.tickTimedState(16_000)
        expect(character.alive).toBe(true)
        expect(character.locationId).toBe(location.id)
        expect(character.position).toEqual(character.spawnPosition)
        expect(character.hp).toBe(maxHp)
        expect(character.snapshot(16_000).stats.minDamage).toBe(damage)
    })

    it('guards city entrances by faction while letting a peaceful creature enter normally', () => {
        const world = new WorldLocations(openMap())
        const monster = new GameCharacter({
            archetype: 'slime',
            controllerKind: 'mob1',
            faction: 'monsters',
            id: 'monster',
            nickname: 'Monster',
            locationId: 'map-1-2',
            spawnPosition: { x: 1528, y: 648 },
        })
        const before = { ...monster.position }
        expect(world.travel(monster, { x: 1, y: 0 })).toBe(cityEntryMessage)
        expect(monster.locationId).toBe('map-1-2')
        expect(monster.position).toEqual(before)
        expect(world.travel(monster, { x: 1, y: 0 })).toBeUndefined()
        const friendly = new GameCharacter({
            archetype: 'slime',
            controllerKind: 'scripted',
            faction: 'peaceful',
            id: 'friend',
            nickname: 'Friend',
            locationId: 'map-1-2',
            spawnPosition: before,
        })
        world.travel(friendly, { x: 1, y: 0 })
        expect(friendly.locationId).toBe(CENTER_LOCATION_ID)
    })
})
