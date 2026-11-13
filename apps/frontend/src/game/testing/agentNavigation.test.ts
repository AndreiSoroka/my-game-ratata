import {
    CENTER_LOCATION_ID,
    GRID_SIZE,
    REGION_NAME,
    WORLD_LOCATION_DEFINITIONS,
} from '@my-game-ratata/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createAgentNavigator } from './agentNavigation'
import { observeGame } from './agentObservation'
import { adventureFixture, characterFixture, worldFixture } from './characterFixture'
import type { RatataTestState, TestCommand } from './testInterface'

const controllers: ReturnType<typeof createAgentNavigator>[] = []
beforeEach(() => vi.useFakeTimers())
afterEach(() => {
    for (const controller of controllers.splice(0)) controller.cancel()
    vi.useRealTimers()
})

function setup() {
    const player = characterFixture('player', { position: { x: 80, y: 80 } })
    const snapshot = worldFixture([player])
    const state: RatataTestState = {
        connected: true,
        defeated: false,
        error: '',
        inventoryOpen: false,
        localPlayerId: player.id,
        player,
        snapshot,
        notice: '',
        status: 'Connected',
        location: {
            ...WORLD_LOCATION_DEFINITIONS.find((entry) => entry.id === CENTER_LOCATION_ID)!,
            columns: GRID_SIZE,
            rows: GRID_SIZE,
            regionName: REGION_NAME,
            map: {
                id: CENTER_LOCATION_ID,
                width: 20,
                height: 20,
                tileWidth: 32,
                tileHeight: 32,
                worldWidth: 640,
                worldHeight: 640,
                solidLayerNames: [],
            },
        },
    }
    const send = vi.fn<(message: TestCommand) => void>()
    const observe = vi.fn<() => ReturnType<typeof observeGame>>(() => observeGame(state))
    const navigator = createAgentNavigator({ getState: () => state, send, observe })
    controllers.push(navigator)
    const tick = async (milliseconds = 100) => {
        snapshot.tick += 1
        await vi.advanceTimersByTimeAsync(milliseconds)
    }
    return { navigator, state, player, snapshot, send, tick, observe }
}

describe('agent navigation', () => {
    it('waits for measured arrival and sends only ordinary commands', async () => {
        const { navigator, player, send, tick } = setup()
        const result = navigator.navigate({ x: 240, y: 80 })
        expect(send.mock.calls).toEqual([
            [{ type: 'cancel_control' }],
            [{ type: 'move_to', target: { x: 240, y: 80 } }],
        ])
        player.position = { x: 225, y: 80 }
        await tick()
        expect(await result).toMatchObject({ status: 'arrived', position: { x: 225, y: 80 } })
        expect(send).toHaveBeenLastCalledWith({ type: 'move_input', axis: { x: 0, y: 0 } })
    })

    it('does not mistake an empty or stopped path for arrival', async () => {
        const { navigator, tick } = setup()
        const result = navigator.navigate({ x: 400, y: 80 })
        await tick(2_000)
        // The first newer snapshot was observed near the beginning of the interval.
        await tick()
        expect(await result).toMatchObject({ status: 'blocked' })
    })

    it('times out when no fresh snapshots arrive and releases movement', async () => {
        const { navigator, send } = setup()
        const result = navigator.navigate({ x: 400, y: 80 }, { timeoutMs: 500 })
        await vi.advanceTimersByTimeAsync(500)
        expect(await result).toMatchObject({ status: 'timeout', elapsedMs: 500 })
        expect(send).toHaveBeenLastCalledWith({ type: 'move_input', axis: { x: 0, y: 0 } })
        expect(vi.getTimerCount()).toBe(0)
    })

    it('cancels superseded navigation without stopping its replacement later', async () => {
        const { navigator, send } = setup()
        const first = navigator.navigate({ x: 400, y: 80 })
        const second = navigator.navigate({ x: 80, y: 400 })
        expect(await first).toMatchObject({ status: 'cancelled' })
        expect(send).toHaveBeenLastCalledWith({ type: 'move_to', target: { x: 80, y: 400 } })
        send.mockClear()
        await vi.advanceTimersByTimeAsync(1_000)
        expect(send).not.toHaveBeenCalled()
        navigator.cancel()
        expect(await second).toMatchObject({ status: 'cancelled' })
        expect(vi.getTimerCount()).toBe(0)
    })

    it.each(['death', 'disconnect', 'identity'] as const)(
        'ends when the player becomes unavailable: %s',
        async (kind) => {
            const { navigator, state, player, send, tick } = setup()
            const result = navigator.navigate({ x: 400, y: 80 })
            if (kind === 'death') player.alive = false
            if (kind === 'disconnect') state.connected = false
            if (kind === 'identity') state.player = characterFixture('replacement')
            send.mockClear()
            await tick()
            expect(await result).toMatchObject({ status: 'unavailable' })
            expect(send).toHaveBeenCalledTimes(kind === 'disconnect' ? 0 : 1)
        }
    )

    it('reports unexpected location changes instead of coordinate arrival', async () => {
        const { navigator, state, tick } = setup()
        const result = navigator.navigate({ x: 400, y: 80 })
        state.location = { ...state.location!, id: 'different-location' }
        await tick()
        expect(await result).toMatchObject({ status: 'location_changed' })
    })

    it('rejects non-finite, off-map and unbounded input before sending anything', () => {
        const { navigator, send } = setup()
        expect(() => navigator.navigate({ x: NaN, y: 80 })).toThrow('finite point')
        expect(() => navigator.navigate({ x: 700, y: 80 })).toThrow('finite point')
        expect(() => navigator.navigate({ x: 400, y: 80 }, { timeoutMs: Infinity })).toThrow(
            'timeout'
        )
        expect(() => navigator.navigate({ x: 400, y: 80 }, { tolerance: -1 })).toThrow('tolerance')
        expect(send).not.toHaveBeenCalled()
    })
})

describe('observed target navigation and travel', () => {
    it('refines the final tile to reach a small item pickup radius', async () => {
        const { navigator, snapshot, player, send, tick } = setup()
        snapshot.items.push({ id: 'item', itemId: 'food', position: { x: 193, y: 193 } })
        const result = navigator.navigate({ targetKey: 'item:item' })
        player.position = { x: 208, y: 208 }
        send.mockClear()
        await tick()
        expect(send).toHaveBeenLastCalledWith({ type: 'move_to', target: { x: 193, y: 193 } })
        player.position = { x: 194, y: 194 }
        await tick()
        expect(await result).toMatchObject({ status: 'arrived' })
    })

    it('uses a visible target and terminates when that exact target disappears', async () => {
        const { navigator, snapshot, observe, state, tick } = setup()
        snapshot.characters.push(characterFixture('npc', { position: { x: 400, y: 80 } }))
        const result = navigator.navigate({ targetKey: 'character:npc' })
        observe.mockReturnValue({ ...observeGame(state), targets: [] })
        await tick()
        expect(await result).toMatchObject({ status: 'target_lost' })
    })

    it('approaches a solid footprint from its perimeter and retries another side if blocked', async () => {
        const { navigator, snapshot, send, tick } = setup()
        snapshot.adventure = {
            ...adventureFixture(),
            worldObjects: [
                {
                    id: 'barrel',
                    name: 'Barrel',
                    kind: 'barrel',
                    position: { x: 400, y: 80 },
                    bounds: { x: 384, y: 64, width: 32, height: 32 },
                    depleted: false,
                },
            ],
        }
        const result = navigator.navigate({ targetKey: 'world:barrel' })
        expect(send).toHaveBeenLastCalledWith({ type: 'move_to', target: { x: 368, y: 80 } })
        await tick(2_000)
        await tick()
        expect(send).toHaveBeenLastCalledWith({ type: 'move_to', target: { x: 384, y: 48 } })
        navigator.cancel()
        expect(await result).toMatchObject({ status: 'cancelled' })
    })

    it('walks to an authored adjacent edge then uses outward input and verifies location arrival', async () => {
        const { navigator, player, state, send, tick } = setup()
        const result = navigator.travel('east')
        expect(send).toHaveBeenLastCalledWith({ type: 'move_to', target: { x: 624, y: 336 } })
        player.position = { x: 624, y: 336 }
        await tick()
        expect(send).toHaveBeenLastCalledWith({ type: 'move_input', axis: { x: 1, y: 0 } })
        state.location = {
            ...state.location!,
            ...WORLD_LOCATION_DEFINITIONS.find((entry) => entry.column === 3 && entry.row === 2)!,
        }
        player.position = { x: 80, y: 336 }
        await tick()
        expect(await result).toMatchObject({ status: 'arrived', locationId: state.location.id })
        expect(send).toHaveBeenLastCalledWith({ type: 'move_input', axis: { x: 0, y: 0 } })
    })

    it('does not cross a world border without an adjacent authored location', async () => {
        const { navigator, state, send } = setup()
        state.location = {
            ...state.location!,
            ...WORLD_LOCATION_DEFINITIONS.find((entry) => entry.column === 0 && entry.row === 0)!,
        }
        expect(await navigator.travel('north')).toMatchObject({ status: 'unavailable' })
        expect(send).not.toHaveBeenCalled()
    })
})
