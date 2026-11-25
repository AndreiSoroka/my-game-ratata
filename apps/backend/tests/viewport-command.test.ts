import {
    CENTER_LOCATION_ID,
    type SetViewportClientMessage,
} from '@my-game-ratata/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { parseClientMessage } from '../src/game/messages'
import { GameRoom } from '../src/game/room'
import type { RoomSocket } from '../src/game/roomMessaging'
import { setSocketViewport, socketViewport } from '../src/game/roomViewport'
import { WorldMaps } from '../src/game/worldMaps'
import { joinScenarioRoom } from './scenarioRoomHelpers'

const hint: SetViewportClientMessage = {
    type: 'set_viewport',
    locationId: 'map-2-2',
    bounds: { left: -32, top: 64, right: 640, bottom: 480 },
}
const rooms: GameRoom[] = []

afterEach(() => {
    for (const room of rooms.splice(0)) {
        room.stop()
    }
    vi.unstubAllGlobals()
    vi.useRealTimers()
})

describe('viewport boundary parsing', () => {
    it('accepts an ordered finite viewport and strips extra client fields', () => {
        expect(
            parseClientMessage(
                JSON.stringify({ ...hint, ownerId: 'someone else' })
            )
        ).toEqual({
            message: hint,
        })
    })

    it.each([
        { ...hint, locationId: 'unknown-location' },
        { ...hint, locationId: 'dungeon-small' },
        { ...hint, locationId: 42 },
        { ...hint, bounds: undefined },
        { ...hint, bounds: [] },
        { ...hint, bounds: null },
        { ...hint, bounds: { ...hint.bounds, left: '0' } },
        { ...hint, bounds: { ...hint.bounds, right: -32 } },
        { ...hint, bounds: { ...hint.bounds, bottom: 0 } },
        { ...hint, bounds: { ...hint.bounds, right: 100_000 } },
        { ...hint, bounds: { ...hint.bounds, bottom: 100_000 } },
        {
            ...hint,
            bounds: { left: 1_000_001, top: 0, right: 1_000_100, bottom: 100 },
        },
        {
            ...hint,
            bounds: {
                left: -1_000_100,
                top: 0,
                right: -1_000_001,
                bottom: 100,
            },
        },
        { ...hint, bounds: { ...hint.bounds, right: Infinity } },
        { ...hint, bounds: { ...hint.bounds, right: NaN } },
    ])('rejects malformed or unbounded input %#', (command) => {
        expect(
            parseClientMessage(JSON.stringify(command)).message
        ).toBeUndefined()
    })

    it('rejects numeric overflow even when JSON parsing produces infinity', () => {
        const raw =
            '{"type":"set_viewport","locationId":"map-2-2","bounds":{"left":0,"top":0,"right":1e309,"bottom":100}}'
        expect(parseClientMessage(raw).message).toBeUndefined()
    })
})

describe('socket viewport ownership', () => {
    function openRoom() {
        vi.stubGlobal('Bun', { env: {} })
        const room = new GameRoom()
        rooms.push(room)
        return room
    }

    it('requires an ordinary joined connection before accepting a viewport', () => {
        const room = openRoom()
        const send = vi.fn()
        const socket = { send } as unknown as RoomSocket
        room.handleOpen(socket)

        room.handleMessage(socket, JSON.stringify(hint))

        expect(JSON.parse(send.mock.calls[0]?.[0] as string)).toMatchObject({
            type: 'error',
            code: 'not_joined',
        })
        expect(
            socketViewport(socket, undefined, hint.locationId)
        ).toBeUndefined()
    })

    it('keeps independent hints per socket and rejects a different location without changing them', () => {
        const room = openRoom()
        const alice = joinScenarioRoom(room, 'Viewport Alice')
        const bob = joinScenarioRoom(room, 'Viewport Bob')
        const bobHint = {
            ...hint,
            bounds: { left: 100, top: 100, right: 500, bottom: 500 },
        }
        alice.send(hint)
        bob.send(bobHint)
        const messagesBeforeTravelRace = alice.sent.length
        const positionBeforeTravelRace = { ...alice.actor.position }
        alice.send({ ...hint, locationId: 'map-2-1' })

        expect(
            socketViewport(alice.socket, alice.actor.id, alice.actor.locationId)
        ).toEqual(hint)
        expect(
            socketViewport(bob.socket, bob.actor.id, bob.actor.locationId)
        ).toEqual(bobHint)
        expect(alice.sent).toHaveLength(messagesBeforeTravelRace)
        expect(alice.actor.position).toEqual(positionBeforeTravelRace)
    })

    it('recognizes a generated dungeon but only stores hints for the current location', () => {
        vi.stubGlobal('Bun', { env: {} })
        const maps = new WorldMaps({ seed: 'dungeon-9' })
        const room = new GameRoom(maps.navigation(CENTER_LOCATION_ID), {
            worldMaps: maps,
        })
        rooms.push(room)
        const { actor, socket, send, sent } = joinScenarioRoom(
            room,
            'Dungeon viewport'
        )
        send(hint)
        const beforeDungeonHint = sent.length

        send({ ...hint, locationId: 'dungeon-small' })
        expect(sent).toHaveLength(beforeDungeonHint)
        expect(socketViewport(socket, actor.id, actor.locationId)).toEqual(hint)

        send({ ...hint, locationId: 'dungeon-medium-2' })
        expect(sent.at(-1)).toEqual({
            type: 'error',
            code: 'invalid_message',
            message: 'Invalid viewport hint',
        })
        expect(socketViewport(socket, actor.id, actor.locationId)).toEqual(hint)
    })

    it('drops an old location hint and does not resurrect it on a return trip', () => {
        const socket = connection()
        expect(setSocketViewport(socket, 'alice', 'map-2-2', hint)).toBe(true)
        expect(socketViewport(socket, 'alice', 'map-2-1')).toBeUndefined()
        expect(socketViewport(socket, 'alice', 'map-2-2')).toBeUndefined()
    })

    it('rejects stale hints when the socket is attached to a different identity', () => {
        const socket = connection()
        setSocketViewport(socket, 'alice', 'map-2-2', hint)
        expect(socketViewport(socket, 'bob', 'map-2-2')).toBeUndefined()
        expect(socketViewport(socket, 'alice', 'map-2-2')).toBeUndefined()
    })

    it('starts fresh after close, reconnect, and joining again on the same socket', () => {
        const room = openRoom()
        const alice = joinScenarioRoom(room, 'Viewport reconnect')
        alice.send(hint)
        room.handleClose(alice.socket)
        expect(
            socketViewport(alice.socket, alice.actor.id, alice.actor.locationId)
        ).toBeUndefined()
        room.handleOpen(alice.socket)
        alice.send({ type: 'join', nickname: 'Viewport reconnect' })
        alice.send(hint)
        alice.send({ type: 'join', nickname: 'Viewport new identity' })
        expect(
            socketViewport(alice.socket, alice.actor.id, alice.actor.locationId)
        ).toBeUndefined()
    })
})

function connection(): RoomSocket {
    return { send: vi.fn() } as unknown as RoomSocket
}

it('does not build or stream snapshots to sockets that have not joined', () => {
    vi.stubGlobal('Bun', { env: {} })
    vi.useFakeTimers()
    const room = new GameRoom(undefined, { emptyWorldMode: 'always' })
    rooms.push(room)
    const send = vi.fn<(payload: string) => void>()
    const socket = { send } as unknown as RoomSocket
    const build = vi.spyOn(room, 'snapshot')
    room.handleOpen(socket)
    room.start()

    vi.advanceTimersByTime(250)

    expect(build).not.toHaveBeenCalled()
    expect(
        send.mock.calls.some(([raw]) =>
            ['snapshot', 'snapshot_delta'].includes(
                (JSON.parse(raw) as { type: string }).type
            )
        )
    ).toBe(false)
    const joined = joinScenarioRoom(room, 'Snapshot traffic after join')
    expect(joined.sent.some(({ type }) => type === 'world_init')).toBe(true)
    vi.advanceTimersByTime(50)
    expect(
        joined.sent.some(
            ({ type }) => type === 'snapshot' || type === 'snapshot_delta'
        )
    ).toBe(true)
})
