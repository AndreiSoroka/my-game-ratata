import assert from 'node:assert/strict'

import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'
import { afterEach, expect, it, vi } from 'vitest'

import { resolveCharacterDamage } from '../src/game/abilityDamage'
import type { GameCharacter } from '../src/game/character'
import { hasPendingCorpseReturn } from '../src/game/corpseReturns'
import { readDungeonMapData } from '../src/game/dungeonMapData'
import { effectiveMaxEnergy } from '../src/game/effectiveResources'
import type { TiledMap } from '../src/game/navigationGrid'
import { GameRoom } from '../src/game/room'
import { WorldMaps } from '../src/game/worldMaps'
import { chestHero } from './chestTestHelpers'

const seed = 'dungeon-9'
const firstFloor = 'dungeon-small'
const secondFloor = 'dungeon-small-floor-2'

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

function defeatZombie(
    room: GameRoom,
    actor: GameCharacter,
    target: GameCharacter
) {
    room.publishEvents(
        resolveCharacterDamage({
            actor,
            target,
            amount: 1_000,
            damageKind: 'arcane',
            now: room.gameplayNow(),
            respawnDelayMs: 1_000,
        }).events
    )
}

it('keeps the seeded zombie and its stars until its heart is taken', () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    vi.stubGlobal('Bun', { env: {} })
    const maps = new WorldMaps({ seed })
    const room = new GameRoom(maps.navigation(CENTER_LOCATION_ID), {
        worldMaps: maps,
    })
    const zombiesOn = (locationId: string) =>
        room
            .snapshot(Date.now(), locationId)
            .characters.filter(({ archetype }) => archetype === 'fat_zombie')
    try {
        expect(zombiesOn(firstFloor)).toHaveLength(0)
        expect(zombiesOn(secondFloor)).toHaveLength(1)
        const [snapshot] = zombiesOn(secondFloor)
        assert(snapshot !== undefined)
        const zombie = room.getCharacter(snapshot.id)
        assert(zombie !== undefined)
        expect(zombie).toMatchObject({
            archetype: 'fat_zombie',
            visualId: 'fat_zombie',
            creatureType: 'undead',
            nickname: 'Жирный зомби',
            locationId: secondFloor,
            faction: 'monsters',
            mortal: true,
            respawnPolicy: 'none',
            revivable: false,
            hp: 800,
            maxHp: 800,
            mana: 0,
            config: {
                attackZones: [{ minX: -0.75, minY: 0, maxX: 0.75, maxY: 1.1 }],
                combat: {
                    attackCooldownMs: 1450,
                    attackLockMs: 900,
                    attackWindupMs: 450,
                    critChance: 0,
                    dodgeChance: 0,
                    minDamage: 2,
                    maxDamage: 3,
                    stunChance: 0,
                },
                hpRegenIdlePerSec: 0.35,
                hpRegenMovePerSec: 0.15,
                moveSpeed: 58,
                resources: {
                    attackEnergyCost: 10,
                    energyRegenIdle: 5,
                    energyRegenMove: 2,
                    maxEnergy: 120,
                    maxMana: 0,
                },
            },
        })
        expect(zombie.energy).toBe(effectiveMaxEnergy(zombie))
        expect(maps.navigation(secondFloor).grid.dungeonFatZombies).toEqual([
            zombie.position,
        ])

        const witness = chestHero('nearby', zombie.position)
        witness.locationId = secondFloor
        const stars = [...zombie.progression.constellations.opened].filter(
            (id) => id.startsWith('fat_zombie.')
        )
        const position = { ...zombie.position }
        room.start()
        defeatZombie(room, witness, zombie)
        expect(zombie.reviveUntil).toBe(0)
        expect(zombiesOn(secondFloor)[0]).toMatchObject({
            alive: false,
            animation: { action: 'death' },
        })
        expect(room.raisableCorpseFor(witness, Date.now())).toBeUndefined()
        expect(zombie.animationStartedAt).toBe(10_000)
        expect(hasPendingCorpseReturn(zombie)).toBe(true)
        vi.setSystemTime(69_900)
        vi.advanceTimersByTime(50)
        expect(zombie.alive).toBe(false)
        expect(hasPendingCorpseReturn(zombie)).toBe(true)
        vi.advanceTimersByTime(50)
        expect(room.getCharacter(zombie.id)).toBe(zombie)
        expect(zombie).toMatchObject({ alive: true, hp: 400, position })
        expect(
            [...zombie.progression.constellations.opened].filter((id) =>
                id.startsWith('fat_zombie.')
            )
        ).toEqual(stars)

        defeatZombie(room, witness, zombie)
        const corpse = `corpse:${zombie.id}:2`
        room.chestActions.handle(
            witness,
            { type: 'open_chest', chestId: corpse },
            Date.now()
        )
        expect(room.chestActions.snapshot(witness, Date.now())?.items).toEqual([
            expect.objectContaining({ itemId: 'zombie_heart' }),
        ])
        room.chestActions.handle(
            witness,
            { type: 'take_all_chest_items', chestId: corpse },
            Date.now()
        )
        expect(witness.inventory).toHaveLength(1)
        expect(witness.inventory[0]?.itemId).toBe('zombie_heart')
        expect(zombiesOn(secondFloor)[0]?.alive).toBe(false)
        vi.advanceTimersByTime(1_000)
        expect(room.getCharacter(zombie.id)).toBeUndefined()
        expect(zombiesOn(secondFloor)).toHaveLength(0)
        expect(room.raisableCorpseFor(witness, Date.now())).toBeUndefined()
    } finally {
        room.stop()
    }
})

it('rejects an authored fat-zombie spawn on the first floor', () => {
    const maps = new WorldMaps({ seed })
    const asset = maps.asset(maps.epoch, firstFloor)
    assert(asset !== undefined)
    const map = JSON.parse(asset.body) as TiledMap
    const spawn = map.layers.find(({ name }) => name === 'Dungeon spawns')
        ?.objects?.[0]
    assert(spawn !== undefined)
    spawn.type = 'fat_zombie'
    expect(() => readDungeonMapData(map, firstFloor)).toThrow(
        `Invalid dungeon enemy on ${firstFloor}`
    )
})
