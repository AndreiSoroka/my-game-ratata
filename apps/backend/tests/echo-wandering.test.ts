import assert from 'node:assert/strict'

import { CENTER_LOCATION_ID, type Vector2 } from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { GameCharacter } from '../src/game/character'
import type { GameCharacterOptions } from '../src/game/characterIdentity'
import {
    echoSeesHostile,
    echoWanderDestination,
} from '../src/game/echoWandering'
import { advanceCharacter } from '../src/game/movement'
import { type MapGrid, NavigationService } from '../src/game/navigation'
import {
    grantPersonalHostility,
    setDeclaredHostility,
    setGroupHostility,
} from '../src/game/personalHostility'

const now = 2_000

function map(overrides: Partial<MapGrid> = {}): NavigationService {
    return new NavigationService({
        id: CENTER_LOCATION_ID,
        width: 16,
        height: 16,
        solid: new Array<boolean>(256).fill(false),
        solidLayerNames: [],
        tileWidth: 16,
        tileHeight: 16,
        ...overrides,
    })
}

function character(
    id: string,
    position: Vector2,
    overrides: Partial<GameCharacterOptions> = {}
): GameCharacter {
    return new GameCharacter({
        id,
        nickname: id,
        archetype: 'human',
        controllerKind: 'network_player',
        spawnPosition: position,
        spawnedAt: now,
        ...overrides,
    })
}

function block(navigation: NavigationService, ...points: Vector2[]): void {
    for (const point of points) {
        const tile = navigation.worldToTile(point)
        navigation.grid.solid[tile.y * navigation.grid.width + tile.x] = true
    }
}

it('recognizes the same directed declarations, personal hostility and group hostility as the combat UI', () => {
    const navigation = map()
    const echo = character('Echo', { x: 72, y: 88 })
    echo.connected = false
    const target = character('Target', { x: 88, y: 88 })
    const sees = (at = now) =>
        echoSeesHostile(echo, [echo, target], navigation, at)

    setDeclaredHostility(target, echo, true)
    expect(sees()).toBe(false)
    setDeclaredHostility(echo, target, true)
    expect(sees()).toBe(true)
    setDeclaredHostility(echo, target, false)
    grantPersonalHostility(target, echo, 'attack', now + 100)
    expect(sees(now + 99)).toBe(true)
    expect(sees(now + 100)).toBe(false)
    setGroupHostility(target, 'living_humans', true)
    expect(sees(now + 100)).toBe(true)
})

it('requires a living local enemy within sight range and an unobstructed sight line', () => {
    const navigation = map()
    const echo = character('Echo', { x: 72, y: 88 })
    const enemy = character('Enemy', { x: 184, y: 88 }, { faction: 'monsters' })
    const dummy = character(
        'Dummy',
        { x: 88, y: 88 },
        {
            faction: 'monsters',
            trainingTarget: { areaId: 'practice' },
        }
    )
    const sees = () => echoSeesHostile(echo, [dummy, enemy], navigation, now)

    expect(sees()).toBe(true)
    enemy.position.x += 1
    expect(sees()).toBe(false)
    enemy.position.x = 120
    enemy.locationId = 'map-2-1'
    expect(sees()).toBe(false)
    enemy.locationId = echo.locationId
    enemy.alive = false
    expect(sees()).toBe(false)
    enemy.alive = true
    block(navigation, { x: 104, y: 88 })
    expect(sees()).toBe(false)
})

it('honors the shared stealth sight radius and recent attacks that reveal a crouching enemy', () => {
    const navigation = map()
    const echo = character('Echo', { x: 88, y: 88 })
    const enemy = character('Enemy', { x: 88, y: 40 }, { faction: 'monsters' })
    expect(echoSeesHostile(echo, [enemy], navigation, now)).toBe(true)
    enemy.movement.mode = 'sneaking'
    expect(echoSeesHostile(echo, [enemy], navigation, now)).toBe(false)
    enemy.lastAttackAt = now - 500
    expect(echoSeesHostile(echo, [enemy], navigation, now)).toBe(true)
})

it('keeps every step of the ordinary movement path within three tiles from an off-center exit', () => {
    const navigation = map({ tileHeight: 24 })
    const origin = { x: 70, y: 76 }
    const echo = character('Echo', origin)
    echo.connected = false
    block(navigation, { x: 88, y: 84 }, { x: 72, y: 60 })
    const visited = new Set<string>()
    let at = now
    for (let step = 0; step < 20; step += 1) {
        const destination = echoWanderDestination(
            echo,
            origin,
            navigation,
            () => 0
        )
        assert.ok(destination !== undefined, 'Expected a walkable step')
        visited.add(`${String(destination.x)},${String(destination.y)}`)
        echo.setPath([destination])
        for (let frame = 0; frame < 10 && echo.hasPath(); frame += 1) {
            advanceCharacter({
                character: echo,
                navigation,
                deltaMs: 50,
                now: (at += 50),
            })
            const { x, y } = echo.position
            expect(
                Math.hypot((x - origin.x) / 16, (y - origin.y) / 24)
            ).toBeLessThanOrEqual(3)
            expect(
                navigation.isSolidTile(navigation.worldToTile(echo.position))
            ).toBe(false)
        }
        expect(echo.position).toEqual(destination)
    }
    expect(visited.size).toBeGreaterThan(1)
})

it('rejects a surface edge even if it is the only walkable neighbor', () => {
    const navigation = map()
    const origin = { x: 24, y: 88 }
    const echo = character('Echo', origin)
    block(navigation, { x: 40, y: 88 }, { x: 24, y: 72 }, { x: 24, y: 104 })
    expect(
        echoWanderDestination(echo, origin, navigation, () => 0)
    ).toBeUndefined()
})

it('avoids a dungeon passage even when both ends of the wander step are outside its trigger', () => {
    const navigation = map({
        id: 'dungeon-small',
        dungeonPassage: {
            id: 'exit',
            position: { x: 80, y: 88 },
            arrival: { x: 72, y: 88 },
            destinationLocationId: CENTER_LOCATION_ID,
            triggerRadius: 4,
        },
    })
    const origin = { x: 72, y: 88 }
    const echo = character('Echo', origin, { locationId: navigation.grid.id })
    block(navigation, { x: 56, y: 88 }, { x: 72, y: 72 }, { x: 72, y: 104 })
    expect(
        echoWanderDestination(echo, origin, navigation, () => 0)
    ).toBeUndefined()
    echo.position = { x: 80, y: 88 }
    expect(echoWanderDestination(echo, origin, navigation, () => 0)).toEqual({
        x: 104,
        y: 88,
    })
})
