import type { GameEventPayload } from '@my-game-ratata/contracts'
import { afterEach, expect, it, vi } from 'vitest'

import { RuntimeSocket } from './runtimeSocket'

afterEach(() => vi.unstubAllGlobals())
it.each(['0.1.0', '0.2.0'])(
    'rejects protocol %s before delivering legacy resource snapshots to presentation',
    (protocolVersion) => {
        const sockets: EventTarget[] = []
        const close = vi.fn<() => void>()
        class TestSocket extends EventTarget {
            public close = close
            public constructor() {
                super()
                sockets.push(this)
            }
        }
        vi.stubGlobal('WebSocket', TestSocket)
        const onSnapshot = vi.fn<() => void>(),
            onWorldInit = vi.fn<() => void>(),
            onError = vi.fn<(message: string) => void>()
        const socket = new RuntimeSocket({
            isStopped: () => false,
            onSnapshot,
            onWorldInit,
            onError,
            onEvent: vi.fn<(event: GameEventPayload) => void>(),
            onStatus: vi.fn<(status: string) => void>(),
        })
        socket.connect('Hero')
        sockets[0]!.dispatchEvent(
            new MessageEvent('message', {
                data: JSON.stringify({
                    type: 'world_init',
                    protocolVersion,
                    snapshot: { characters: [] },
                }),
            })
        )
        sockets[0]!.dispatchEvent(
            new MessageEvent('message', {
                data: JSON.stringify({ type: 'snapshot', snapshot: { characters: [] } }),
            })
        )
        expect(close).toHaveBeenCalledOnce()
        expect(onError).toHaveBeenCalledWith(expect.stringContaining('Перезапустите сервер'))
        expect(onSnapshot).not.toHaveBeenCalled()
        expect(onWorldInit).not.toHaveBeenCalled()
    }
)
it('ignores late messages from a retired client runtime after starting another life', () => {
    const sockets: EventTarget[] = []
    class TestSocket extends EventTarget {
        public constructor() {
            super()
            sockets.push(this)
        }
    }
    vi.stubGlobal('WebSocket', TestSocket)
    let stopped = false
    const onEvent = vi.fn<(event: GameEventPayload) => void>()
    const onStatus = vi.fn<(status: string) => void>()
    const onSnapshot = vi.fn<() => void>()
    const onWorldInit = vi.fn<() => void>()
    const onError = vi.fn<(message: string) => void>()
    const runtime = new RuntimeSocket({
        isStopped: () => stopped,
        onEvent,
        onStatus,
        onSnapshot,
        onWorldInit,
        onError,
    })
    runtime.connect('Hero', 'cleric')
    const receive = (data: unknown) =>
        sockets[0]?.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(data) }))
    receive({ type: 'event', event: { kind: 'notice', actorId: 'old', text: 'Before retirement' } })
    expect(onEvent).toHaveBeenCalledOnce()
    stopped = true
    receive({ type: 'event', event: { kind: 'permadeath', actorId: 'old' } })
    receive({ type: 'snapshot', snapshot: { characters: [] } })
    receive({ type: 'world_init', playerId: 'old', snapshot: { characters: [] } })
    receive({ type: 'error', message: 'Late old socket error' })
    expect(onEvent).toHaveBeenCalledOnce()
    expect(onSnapshot).not.toHaveBeenCalled()
    expect(onWorldInit).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
})

it('does not create a stopped connection or send a join when an old socket opens late', () => {
    const sockets: EventTarget[] = []
    const send = vi.fn<(data: string) => void>()
    class TestSocket extends EventTarget {
        public static readonly OPEN = 1
        public readonly readyState = 1
        public send = send
        public close(): void {
            /* Deliberately delay close delivery to exercise the race. */
        }
        public constructor() {
            super()
            sockets.push(this)
        }
    }
    vi.stubGlobal('WebSocket', TestSocket)
    let stopped = true
    const onStatus = vi.fn<(status: string) => void>()
    const runtime = new RuntimeSocket({
        isStopped: () => stopped,
        onStatus,
        onError: vi.fn<(message: string) => void>(),
        onEvent: vi.fn<(event: GameEventPayload) => void>(),
        onSnapshot: vi.fn<() => void>(),
        onWorldInit: vi.fn<() => void>(),
    })
    runtime.connect('Old hero')
    expect(sockets).toHaveLength(0)
    expect(onStatus).not.toHaveBeenCalled()
    stopped = false
    runtime.connect('Old hero')
    expect(sockets).toHaveLength(1)
    stopped = true
    runtime.close()
    sockets[0]!.dispatchEvent(new Event('open'))
    runtime.send({ type: 'chat', text: 'late' })
    expect(send).not.toHaveBeenCalled()
})
