import { CONTRACT_PROTOCOL_VERSION, type GameEventPayload } from '@my-game-ratata/contracts'
import { afterEach, expect, it, vi } from 'vitest'

import { worldFixture } from '../testing/characterFixture'
import { resolveWorldMapUrl, RuntimeSocket } from './runtimeSocket'

afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
})
it.each([undefined, false, true])(
    'sends createOnly only for an explicitly generated proposal (%s)',
    (createOnly) => {
        const sockets: EventTarget[] = []
        const send = vi.fn<(data: string) => void>()
        class TestSocket extends EventTarget {
            public static readonly OPEN = 1
            public readonly readyState = 1
            public send = send
            public close(): void {}
            public constructor() {
                super()
                sockets.push(this)
            }
        }
        vi.stubGlobal('WebSocket', TestSocket)
        const runtime = new RuntimeSocket({
            isStopped: () => false,
            onError: vi.fn<() => void>(),
            onEvent: vi.fn<() => void>(),
            onSnapshot: vi.fn<() => void>(),
            onStatus: vi.fn<() => void>(),
            onWorldInit: vi.fn<() => void>(),
        })
        runtime.connect('Hero', 'ranger', createOnly)
        sockets[0]!.dispatchEvent(new Event('open'))
        expect(send).toHaveBeenCalledOnce()
        expect(JSON.parse(send.mock.calls[0]![0])).toEqual({
            type: 'join',
            nickname: 'Hero',
            heroClass: 'ranger',
            ...(createOnly === true ? { createOnly: true } : {}),
        })
    }
)
it.each(['0.1.0', '0.2.0', '0.15.0'])(
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
        public static readonly OPEN = 1
        public readonly readyState = TestSocket.OPEN
        public readonly send = vi.fn<(data: string) => void>()
        public readonly close = vi.fn<() => void>()
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
    receive({
        type: 'world_init',
        streamId: 1,
        seq: 0,
        protocolVersion: CONTRACT_PROTOCOL_VERSION,
        playerId: 'old',
        snapshot: worldFixture([]),
    })
    onWorldInit.mockClear()
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
    runtime.close()
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

it('does not deliver snapshots or animation events before the authoritative world initialization', () => {
    const sockets: EventTarget[] = []
    class TestSocket extends EventTarget {
        public static readonly OPEN = 1
        public readonly readyState = TestSocket.OPEN
        public readonly send = vi.fn<(data: string) => void>()
        public close(): void {}
        public constructor() {
            super()
            sockets.push(this)
        }
    }
    vi.stubGlobal('WebSocket', TestSocket)
    const onSnapshot = vi.fn<(...args: unknown[]) => void>(),
        onEvent = vi.fn<(...args: unknown[]) => void>(),
        onWorldInit = vi.fn<(...args: unknown[]) => void>()
    const runtime = new RuntimeSocket({
        isStopped: () => false,
        onSnapshot,
        onEvent,
        onWorldInit,
        onError: vi.fn<(...args: unknown[]) => void>(),
        onStatus: vi.fn<(...args: unknown[]) => void>(),
    })
    runtime.connect('Hero')
    const receive = (message: unknown) =>
        sockets[0]!.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }))
    receive({ type: 'snapshot', snapshot: { characters: [] } })
    receive({ type: 'event', event: { kind: 'bell_activate', objectId: 'bell', eventId: 'old' } })
    expect(onSnapshot).not.toHaveBeenCalled()
    expect(onEvent).not.toHaveBeenCalled()
    const map = { id: 'map-2-2', asset: { url: '/world/maps/world/map-2-2.json', revision: 'a' } }
    const snapshot = worldFixture([])
    receive({
        type: 'world_init',
        streamId: 1,
        seq: 0,
        protocolVersion: CONTRACT_PROTOCOL_VERSION,
        playerId: 'hero',
        snapshot,
        map,
        tickMs: 50,
    })
    expect(onWorldInit).toHaveBeenCalledExactlyOnceWith(
        'hero',
        snapshot,
        map,
        { streamId: 1, seq: 0 },
        50
    )
    receive({ type: 'snapshot', streamId: 1, seq: 1, snapshot })
    expect(onSnapshot).toHaveBeenCalledOnce()
    runtime.close()
})

it('resolves dynamic maps at the backend origin and static test maps at the frontend', () => {
    vi.stubEnv('VITE_BACKEND_WS_URL', 'wss://game.example.test/ws')
    expect(resolveWorldMapUrl('/world/maps/world/map-2-2.json')).toBe(
        'https://game.example.test/world/maps/world/map-2-2.json'
    )
    expect(resolveWorldMapUrl('/game/map/map1.json')).toBe(
        new URL('/game/map/map1.json', window.location.origin).href
    )
})
