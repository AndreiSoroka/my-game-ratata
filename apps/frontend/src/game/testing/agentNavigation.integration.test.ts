import {
    resourceFillPercent,
    type ServerMessage,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { NavigationService } from '../../../../backend/src/game/navigation'
import { GameRoom } from '../../../../backend/src/game/room'
import type { RoomSocket } from '../../../../backend/src/game/roomMessaging'
import { stopAgentMovement } from './agentMovementStop'
import { createAgentNavigator } from './agentNavigation'
import type { RatataTestState, TestCommand } from './testInterface'

const rooms: GameRoom[] = []
beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    vi.stubGlobal('Bun', { env: {} })
})
afterEach(() => {
    for (const room of rooms.splice(0)) room.stop()
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

function setup() {
    const room = new GameRoom(
        new NavigationService({
            id: 'agent-stop-test',
            width: 100,
            height: 100,
            tileWidth: 16,
            tileHeight: 16,
            solid: Array<boolean>(10_000).fill(false),
            solidLayerNames: [],
        })
    )
    rooms.push(room)
    let playerId: string | undefined
    let snapshot: WorldSnapshot | undefined
    const socket = {
        send: (raw: string) => {
            const message = JSON.parse(raw) as ServerMessage
            if (message.type === 'world_init') playerId = message.playerId
            if (message.type === 'world_init' || message.type === 'snapshot')
                snapshot = message.snapshot
        },
    } as unknown as RoomSocket
    room.handleOpen(socket)
    room.handleMessage(
        socket,
        JSON.stringify({ type: 'join', nickname: 'Navigation test', heroClass: 'ranger' })
    )
    const getState = (): RatataTestState => ({
        connected: true,
        defeated: false,
        error: '',
        inventoryOpen: false,
        localPlayerId: playerId,
        location: snapshot?.location,
        notice: '',
        player: snapshot?.characters.find((actor) => actor.id === playerId),
        snapshot,
        status: 'Connected',
    })
    const send = (command: TestCommand) => room.handleMessage(socket, JSON.stringify(command))
    const navigator = createAgentNavigator({ getState, send })
    room.start()
    return { navigator, getState, send }
}

describe('AI navigation through authoritative player commands', () => {
    it('stops a just-issued dash before its state is observed without refunding its cost', async () => {
        const { getState, send } = setup()
        const before = getState().player!
        send({ type: 'dash' })
        // The received state still predates the accepted dash intention.
        expect(getState().player!.movement?.dashing).toBe(false)
        stopAgentMovement(getState(), send)
        await vi.advanceTimersByTimeAsync(500)
        const stopped = getState().player!
        expect(stopped.position).toEqual(before.position)
        expect(stopped.movement?.dashing).toBe(false)
        expect(stopped.movement?.dashCooldownMsLeft).toBeGreaterThan(0)
        expect(resourceFillPercent(stopped.resources.energy)).toBeLessThan(
            resourceFillPercent(before.resources.energy)
        )
        await vi.advanceTimersByTimeAsync(500)
        expect(getState().player!.position).toEqual(stopped.position)
    })

    it.each(['arrival', 'cancel', 'timeout'] as const)(
        'replaces the remaining click path on %s and stays stopped over later server ticks',
        async (outcome) => {
            const { navigator, getState } = setup()
            const start = { ...getState().player!.position }
            const destination = { x: start.x + 300, y: start.y }
            const journey = navigator.navigate(destination, {
                tolerance: 64,
                timeoutMs: outcome === 'timeout' ? 500 : 10_000,
            })
            // Shared human movement has no extra Ranger speed: allow reaching the 64px tolerance.
            await vi.advanceTimersByTimeAsync(outcome === 'arrival' ? 3_000 : 500)
            expect(getState().player!.position.x).toBeGreaterThan(start.x)
            if (outcome === 'cancel') navigator.cancel()
            expect((await journey).status).toBe(
                outcome === 'arrival' ? 'arrived' : outcome === 'cancel' ? 'cancelled' : 'timeout'
            )
            // Allow the replacement path at the last received position to settle normally.
            await vi.advanceTimersByTimeAsync(300)
            const stopped = getState().player!
            expect(stopped.path).toEqual([])
            expect(stopped.velocity).toEqual({ x: 0, y: 0 })
            expect(stopped.position.x).toBeLessThan(destination.x - 32)
            await vi.advanceTimersByTimeAsync(1_000)
            expect(getState().player!.position).toEqual(stopped.position)
            expect(getState().player!.path).toEqual([])
        }
    )
})
