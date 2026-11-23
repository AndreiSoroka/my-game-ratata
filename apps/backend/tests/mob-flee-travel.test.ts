import {
    WORLD_DIRECTIONS,
    type WorldDirection,
    worldLocationNeighbor,
} from '@my-game-ratata/contracts'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { createItemInstance } from '../src/game/inventory'
import { distance } from '../src/game/math'
import { NavigationService } from '../src/game/navigation'
import { GameRoom } from '../src/game/room'
import { joinScenarioRoom } from './scenarioRoomHelpers'

let room: GameRoom | undefined

beforeEach(() => {
    vi.stubGlobal('Bun', { env: {} })
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
})

afterEach(() => {
    room?.stop()
    room = undefined
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

it.each(['east', 'south'] as const)(
    'walks through the $0 edge and keeps the same living slime past the initial range of flight',
    (direction) => {
        const source = 'map-1-1'
        const next = worldLocationNeighbor(source, direction)
        const { game, slime, threat } = threatenedSlime(source, direction)
        const item = createItemInstance('food')
        slime.inventory.push(item)
        const origin = { ...slime.position }
        const spawn = { ...slime.spawnPosition }
        let passedFlightRange = false

        for (let tick = 0; tick < 30 && slime.locationId === source; tick++) {
            passedFlightRange ||= distance(slime.position, threat.position) > 80
            vi.advanceTimersByTime(50)
        }

        expect(passedFlightRange).toBe(true)
        expect(slime.locationId).toBe(next?.id)
        expect(game.getCharacter(slime.id)).toBe(slime)
        expect(slime.spawnLocationId).toBe(source)
        expect(slime.spawnPosition).toEqual(spawn)
        expect(slime.alive).toBe(true)
        expect(slime.hp).toBeLessThan(slime.maxHp * 0.35)
        expect(slime.inventory).toEqual([item])
        expect(slime.position).not.toEqual(origin)
        const landing = game.navigationFor(slime)
        expect(landing.isSolidTile(landing.worldToTile(slime.position))).toBe(
            false
        )
        vi.advanceTimersByTime(300)
        expect(slime.locationId).toBe(next?.id)
    }
)

it.each([
    { source: 'map-4-1', reason: 'the outer edge', wall: false },
    { source: 'map-1-2', reason: 'the city border', wall: false },
    { source: 'map-1-1', reason: 'a solid edge', wall: true },
])(
    'keeps a fleeing slime inside its location at $reason',
    ({ source, wall }) => {
        const { slime, threat, navigation } = threatenedSlime(
            source,
            'east',
            wall
        )
        const initialDistance = distance(slime.position, threat.position)
        let farthest = initialDistance
        for (let tick = 0; tick < 24; tick++) {
            vi.advanceTimersByTime(50)
            expect(slime.locationId).toBe(source)
            farthest = Math.max(
                farthest,
                distance(slime.position, threat.position)
            )
        }
        expect(farthest).toBeGreaterThan(initialDistance)
        expect(
            navigation.isSolidTile(navigation.worldToTile(slime.position))
        ).toBe(false)
    }
)

function threatenedSlime(
    locationId: string,
    direction: WorldDirection,
    wall = false
) {
    const width = 20
    const height = 20
    const tileSize = 16
    const game = new GameRoom(
        new NavigationService({
            id: 'slime-flight-test',
            width,
            height,
            tileWidth: tileSize,
            tileHeight: tileSize,
            solidLayerNames: [],
            solid: Array.from(
                { length: width * height },
                (_, cell) => wall && cell % width === width - 1
            ),
        })
    )
    room = game
    const slime = game.getCharacter(`mob_slime_1_${locationId}`)
    if (slime === undefined) {
        throw new Error(`Missing authored slime for ${locationId}`)
    }
    const navigation = game.navigationFor(slime)
    const axis = WORLD_DIRECTIONS[direction]
    const middle = navigation.tileToWorld({ x: width / 2, y: height / 2 })
    const fromCenter = (width * tileSize) / 2 - tileSize / 2 - 48
    const { actor: threat } = joinScenarioRoom(game, 'Slime flight observer')
    slime.position = {
        x: middle.x + axis.x * fromCenter,
        y: middle.y + axis.y * fromCenter,
    }
    slime.hp = 1
    threat.locationId = locationId
    threat.position = {
        x: slime.position.x - axis.x * 48,
        y: slime.position.y - axis.y * 48,
    }
    game.start()
    return { game, slime, threat, navigation }
}
