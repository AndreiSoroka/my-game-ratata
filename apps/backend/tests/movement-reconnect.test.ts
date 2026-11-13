import { MOVEMENT_RULES, type ServerMessage } from '@my-game-ratata/contracts'
import { afterEach, expect, it, vi } from 'vitest'

import { GameRoom } from '../src/game/room'
import type { RoomSocket } from '../src/game/roomMessaging'

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

it.each(['sneaking', 'dash'] as const)(
    'cancels latched movement and %s on reconnect without refunding dash cost or cooldown',
    (intent) => {
        vi.stubGlobal('Bun', { env: {} })
        vi.useFakeTimers()
        vi.setSystemTime(1_000)
        const room = new GameRoom()
        const messages: ServerMessage[] = []
        const first = {
            send: (raw: string) =>
                messages.push(JSON.parse(raw) as ServerMessage),
        } as unknown as RoomSocket
        const second = {
            send: (raw: string) =>
                messages.push(JSON.parse(raw) as ServerMessage),
        } as unknown as RoomSocket
        room.handleOpen(first)
        room.handleMessage(
            first,
            JSON.stringify({ type: 'join', nickname: 'Reconnect' })
        )
        const init = messages.find((message) => message.type === 'world_init')
        if (init === undefined) {
            throw new Error('Missing init')
        }
        const actor = room.getCharacter(init.playerId)
        if (actor === undefined) {
            throw new Error('Missing character')
        }
        room.handleMessage(
            first,
            JSON.stringify({ type: 'move_input', axis: { x: 1, y: 0 } })
        )
        room.handleMessage(
            first,
            JSON.stringify(
                intent === 'dash'
                    ? { type: 'dash' }
                    : { type: 'movement_mode', mode: 'sneaking' }
            )
        )
        expect(actor.getMoveInput()).toEqual({ x: 1, y: 0 })
        expect(actor.movement.mode).toBe(
            intent === 'dash' ? 'walking' : 'sneaking'
        )
        expect(actor.movement.dashUntil).toBe(
            intent === 'dash' ? 1_000 + MOVEMENT_RULES.dashDurationMs : 0
        )
        const cooldown = actor.movement.dashAvailableAt
        const energy = actor.energy
        room.handleClose(first)
        expect(actor.movement.mode).toBe('walking')
        expect(actor.movement.dashUntil).toBe(0)
        room.handleOpen(second)
        room.handleMessage(
            second,
            JSON.stringify({ type: 'join', nickname: 'Reconnect' })
        )
        expect(actor.movement.dashAvailableAt).toBe(cooldown)
        expect(actor.energy).toBe(energy)
        expect(actor.getMoveInput()).toEqual({ x: 0, y: 0 })
        if (intent === 'dash') {
            room.handleMessage(second, JSON.stringify({ type: 'dash' }))
            expect(actor.movement.dashUntil).toBe(0)
        }
        room.stop()
    }
)
