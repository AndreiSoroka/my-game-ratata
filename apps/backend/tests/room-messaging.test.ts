import {
    CONTRACT_PROTOCOL_VERSION,
    type ServerMessage,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'
import { describe, expect, it, vi } from 'vitest'

import { parseClientMessage } from '../src/game/messages'
import { replyToMotionPing } from '../src/game/motionProbe'
import {
    broadcast,
    type RoomSocket,
    send,
    sendSnapshot,
} from '../src/game/roomMessaging'
import { createWebSocketHandlers } from '../src/server'

function connection(queuedBytes = 0) {
    const send = vi.fn<(payload: string, compress?: boolean) => number>(() => 1)
    const getBufferedAmount = vi.fn(() => queuedBytes)
    return {
        socket: { send, getBufferedAmount } as unknown as RoomSocket,
        send,
        getBufferedAmount,
    }
}

function snapshot(tick = 1): WorldSnapshot {
    return {
        tick,
        serverTime: tick * 50,
        characters: [],
        chests: [],
        items: [],
    }
}

const notice: ServerMessage = {
    type: 'event',
    serverTime: 1000,
    event: { kind: 'notice', actorId: 'player', text: 'Action resolved' },
}

describe('motion probes', () => {
    it.each([null, 0, -1, 0.5, '1', Number.MAX_SAFE_INTEGER + 1])(
        'rejects invalid probe identifiers (%s)',
        (id) => {
            expect(
                parseClientMessage(JSON.stringify({ type: 'motion_ping', id }))
            ).toEqual({
                error: 'Invalid motion probe id',
            })
        }
    )

    it('skips queued sockets and limits replies by wall time', () => {
        const f = connection(1)
        replyToMotionPing(f.socket, 1, 150, 5000)
        expect(f.send).not.toHaveBeenCalled()
        f.getBufferedAmount.mockReturnValue(0)
        replyToMotionPing(f.socket, 2, 150, 5000)
        replyToMotionPing(f.socket, 3, 150, 5499)
        replyToMotionPing(f.socket, 4, 150, 5500)
        expect(f.send.mock.calls).toEqual([
            [
                JSON.stringify({
                    type: 'motion_pong',
                    id: 2,
                    serverReceivedAt: 150,
                }),
                true,
            ],
            [
                JSON.stringify({
                    type: 'motion_pong',
                    id: 4,
                    serverReceivedAt: 150,
                }),
                true,
            ],
        ])
    })
})

describe('room snapshot delivery', () => {
    it('skips expensive snapshot construction while a connection has queued data', () => {
        const slow = connection(1)
        const build = vi.fn(() => snapshot())

        sendSnapshot(slow.socket, build)

        expect(build).not.toHaveBeenCalled()
        expect(slow.send).not.toHaveBeenCalled()
    })

    it('sends the current state immediately on the next tick after the queue drains', () => {
        const slow = connection(4096)
        const old = vi.fn(() => snapshot(1))
        sendSnapshot(slow.socket, old)
        sendSnapshot(slow.socket, () => snapshot(2))
        slow.getBufferedAmount.mockReturnValue(0)
        sendSnapshot(slow.socket, () => snapshot(3))

        expect(old).not.toHaveBeenCalled()
        expect(slow.send).toHaveBeenCalledExactlyOnceWith(
            expect.any(String),
            true
        )
    })

    it('keeps fast observers updating independently of slow observers', () => {
        const slow = connection(100_000)
        const fast = connection()
        const slowBuild = vi.fn(() => snapshot())
        const fastBuild = vi.fn(() => snapshot())

        sendSnapshot(slow.socket, slowBuild)
        sendSnapshot(fast.socket, fastBuild)

        expect(slowBuild).not.toHaveBeenCalled()
        expect(fastBuild).toHaveBeenCalledOnce()
        expect(fast.send).toHaveBeenCalledOnce()
    })

    it('does not suppress reliable results or initial world state behind a snapshot', () => {
        const slow = connection(4096)
        const init: ServerMessage = {
            type: 'world_init',
            streamId: 1,
            seq: 0,
            playerId: 'player',
            protocolVersion: CONTRACT_PROTOCOL_VERSION,
            tickMs: 50,
            snapshot: snapshot(),
            map: {
                id: 'map-2-2',
                asset: { url: '/world/maps/test.json', revision: 'test' },
                width: 10,
                height: 10,
                tileWidth: 16,
                tileHeight: 16,
                worldWidth: 160,
                worldHeight: 160,
                solidLayerNames: [],
            },
        }

        send(slow.socket, notice)
        send(slow.socket, init)

        expect(slow.send).toHaveBeenNthCalledWith(
            1,
            JSON.stringify(notice),
            true
        )
        expect(slow.send).toHaveBeenNthCalledWith(2, JSON.stringify(init), true)
    })

    it('supports synchronous in-memory connections without a native network queue', () => {
        const send = vi.fn(() => 1)
        const socket = { send } as unknown as RoomSocket

        sendSnapshot(socket, () => snapshot())

        expect(send).toHaveBeenCalledOnce()
    })
})

describe('negotiated WebSocket compression', () => {
    it('enables the native per-message extension', () => {
        expect(createWebSocketHandlers(() => undefined).perMessageDeflate).toBe(
            true
        )
    })

    it('requests compression for broadcasts without filtering reliable recipients', () => {
        const slow = connection(4096)
        const fast = connection()

        broadcast([slow.socket, fast.socket], notice)

        for (const observer of [slow, fast]) {
            expect(observer.send).toHaveBeenCalledExactlyOnceWith(
                JSON.stringify(notice),
                true
            )
        }
    })
})
