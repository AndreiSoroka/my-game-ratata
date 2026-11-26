import {
    CENTER_LOCATION_ID,
    encounterDifficulty,
    WORLD_LOCATION_DEFINITIONS,
} from '@my-game-ratata/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { distance } from '../src/game/math'
import {
    loadNavigationService,
    NavigationService,
} from '../src/game/navigation'
import { GameRoom } from '../src/game/room'
import type { RoomSocket } from '../src/game/roomMessaging'
import {
    createFriendlyGirl,
    createSkeleton,
    createSlime,
    playerSpawn,
} from '../src/game/spawns'
import { createLocationEnemies } from '../src/game/worldSpawns'

beforeEach(() => vi.stubGlobal('Bun', { env: {} }))
afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
})

const wilderness = WORLD_LOCATION_DEFINITIONS.filter(
    (location) => location.dangerLevel > 0
)

describe('reachable wilderness encounters', () => {
    it.each(wilderness)(
        '$id keeps scaled enemies on connected ground away from entrances',
        (location) => {
            const navigation = loadNavigationService(location.id)
            const player = playerSpawn(navigation, 1)
            const encounters = createLocationEnemies(navigation, location)
            expect(encounters).toHaveLength(
                encounterDifficulty(location.dangerLevel).enemyCount
            )
            expect(
                new Set(encounters.map(({ character }) => character.id)).size
            ).toBe(encounters.length)
            for (const { character } of encounters) {
                const tile = navigation.worldToTile(character.position)
                expect(navigation.isSolidTile(tile)).toBe(false)
                expect(tile.x).toBeGreaterThan(8)
                expect(tile.y).toBeGreaterThan(8)
                expect(tile.x).toBeLessThan(navigation.grid.width - 8)
                expect(tile.y).toBeLessThan(navigation.grid.height - 8)
                expect(character.locationId).toBe(location.id)
                expect(character.spawnLocationId).toBe(location.id)
                expect(distance(character.position, player)).toBeGreaterThan(
                    112
                )
                expect(
                    navigation.findPathWorld(player, character.position).at(-1)
                ).toEqual(character.position)
            }
        }
    )

    it('keeps the original small custom-map spawns', () => {
        const navigation = new NavigationService({
            id: 'small',
            width: 16,
            height: 12,
            tileWidth: 16,
            tileHeight: 16,
            solid: new Array<boolean>(16 * 12).fill(false),
            solidLayerNames: [],
        })
        expect(
            navigation.worldToTile(
                createSkeleton(navigation).character.position
            )
        ).toEqual({ x: 10, y: 5 })
        expect(
            navigation.worldToTile(createSlime(navigation).character.position)
        ).toEqual({ x: 11, y: 5 })
        expect(
            navigation.worldToTile(
                createFriendlyGirl(navigation).character.position
            )
        ).toEqual({ x: 4, y: 2 })
        expect(navigation.worldToTile(playerSpawn(navigation, 1))).toEqual({
            x: 1,
            y: 1,
        })
    })

    // A simulated minute executes every room tick across the authored world.
    // This wall-clock budget also covers full-suite CPU contention.
    it('keeps Novogorod free of hostiles while a new player spends a minute in the city', () => {
        vi.useFakeTimers()
        vi.setSystemTime(10_000)
        const room = new GameRoom(loadNavigationService(CENTER_LOCATION_ID))
        const socket = { send: () => 1 } as unknown as RoomSocket
        room.handleOpen(socket)
        room.handleMessage(
            socket,
            JSON.stringify({
                type: 'join',
                nickname: 'Camp visitor',
                heroClass: 'vanguard',
            })
        )
        expect(
            room
                .snapshot()
                .characters.some(
                    (character) => character.nickname === 'Camp visitor'
                )
        ).toBe(true)
        room.start()
        try {
            for (let second = 0; second < 60; second += 1) {
                vi.advanceTimersByTime(1_000)
                const city = room.snapshot()
                expect(city.location).toMatchObject({
                    id: CENTER_LOCATION_ID,
                    biome: 'city',
                    dangerLevel: 0,
                })
                expect(
                    city.characters.some(
                        (character) => character.faction === 'monsters'
                    )
                ).toBe(false)
                for (const resident of city.characters) {
                    expect(resident.alive).toBe(true)
                    expect(resident.health).toEqual({
                        kind: 'percent',
                        percent: 100,
                    })
                }
            }
        } finally {
            room.stop()
        }
    }, 60_000)
})
