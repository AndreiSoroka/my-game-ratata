import {
    CONTRACT_PROTOCOL_VERSION,
    diffSnapshots,
    type ServerMessage,
} from '@my-game-ratata/contracts'
import { afterEach, expect, it, vi } from 'vitest'

import { characterFixture, worldFixture } from '../testing/characterFixture'
import { RuntimeSocket } from './runtimeSocket'

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

function setup() {
    vi.useFakeTimers()
    const sockets: TestSocket[] = []
    class TestSocket extends EventTarget {
        public static readonly OPEN = 1
        public readonly readyState = 1
        public readonly send = vi.fn<(data: string) => void>()
        public readonly close = vi.fn<() => void>()
        public constructor() {
            super()
            sockets.push(this)
        }
    }
    vi.stubGlobal('WebSocket', TestSocket)
    const order: string[] = []
    const onSnapshot = vi.fn<() => void>(() => {
        order.push('snapshot')
    })
    const onSnapshotInvalidated = vi.fn<() => void>()
    const onStreamReset = vi.fn<() => void>(() => {
        order.push('reset')
    })
    const runtime = new RuntimeSocket({
        isStopped: () => false,
        onSnapshot,
        onSnapshotInvalidated,
        onStreamReset,
        onWorldInit: vi.fn<() => void>(() => {
            order.push('init')
        }),
        onEvent: vi.fn<() => void>(() => {
            order.push('event')
        }),
        onError: vi.fn<() => void>(),
        onStatus: vi.fn<() => void>(),
    })
    runtime.connect('Self')
    const socket = sockets[0]!
    socket.dispatchEvent(new Event('open'))
    const snapshot = { ...worldFixture([characterFixture('self')]), stepMs: 0 }
    const emit = (message: unknown, target = socket) =>
        target.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }))
    emit({
        type: 'world_init',
        streamId: 1,
        seq: 0,
        protocolVersion: CONTRACT_PROTOCOL_VERSION,
        playerId: 'self',
        snapshot,
        tickMs: 50,
        map: { id: 'map-2-2' },
    })
    const resyncs = () =>
        socket.send.mock.calls
            .map(([data]) => JSON.parse(data) as { type: string })
            .filter((message) => message.type === 'snapshot_resync')
    return {
        runtime,
        socket,
        sockets,
        snapshot,
        emit,
        onSnapshot,
        onSnapshotInvalidated,
        onStreamReset,
        resyncs,
        order,
    }
}

it('delivers decoded snapshots and preserves the ordering of reliable events', () => {
    const f = setup()
    const next = {
        ...f.snapshot,
        tick: 2,
        serverTime: f.snapshot.serverTime + 50,
        stepMs: 50,
        characters: [characterFixture('self', { position: { x: 4, y: 2 } })],
    }
    f.emit({
        type: 'snapshot_delta',
        streamId: 1,
        seq: 1,
        baseSeq: 0,
        tick: next.tick,
        serverTime: next.serverTime,
        stepMs: 50,
        patch: diffSnapshots(f.snapshot, next),
    })
    f.emit({
        type: 'event',
        serverTime: next.serverTime,
        event: { kind: 'notice', text: 'Resolved' },
    })
    expect(f.onSnapshot).toHaveBeenCalledExactlyOnceWith(next)
    expect(f.order).toEqual(['reset', 'init', 'snapshot', 'event'])
    expect(f.resyncs()).toHaveLength(0)
    f.runtime.close()
})

it('coalesces bad deltas and retries once per three seconds until a full frame restores state', async () => {
    const f = setup()
    const missing = {
        type: 'snapshot_delta',
        streamId: 1,
        seq: 2,
        baseSeq: 1,
        tick: 3,
        serverTime: f.snapshot.serverTime + 100,
        stepMs: 50,
    }
    f.emit(missing)
    f.emit({ ...missing, seq: 3, baseSeq: 2 })
    expect(f.onSnapshotInvalidated).toHaveBeenCalledOnce()
    expect(f.onSnapshot).not.toHaveBeenCalled()
    expect(f.resyncs()).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(2999)
    expect(f.resyncs()).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(f.resyncs()).toHaveLength(2)
    f.emit({
        type: 'snapshot',
        streamId: 1,
        seq: 4,
        snapshot: { ...f.snapshot, tick: 4, serverTime: f.snapshot.serverTime + 150, stepMs: 50 },
    })
    expect(f.onSnapshot).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(6000)
    expect(f.resyncs()).toHaveLength(2)
    expect(f.onStreamReset).toHaveBeenCalledOnce()
    f.runtime.close()
})

it('resets presentation before a newly adopted stream and ignores retired sockets', async () => {
    const f = setup()
    f.emit({
        type: 'snapshot',
        streamId: 2,
        seq: 0,
        snapshot: { ...f.snapshot, tick: 2, serverTime: f.snapshot.serverTime + 50 },
    })
    expect(f.order).toEqual(['reset', 'init', 'reset', 'snapshot'])
    f.emit({
        type: 'snapshot_delta',
        streamId: 2,
        seq: 2,
        baseSeq: 1,
        tick: 4,
        serverTime: 100200,
        stepMs: 50,
    })
    expect(f.resyncs()).toHaveLength(1)
    f.runtime.connect('Next')
    f.emit({ type: 'snapshot', streamId: 9, seq: 9, snapshot: f.snapshot })
    await vi.advanceTimersByTimeAsync(6000)
    expect(f.resyncs()).toHaveLength(1)
    expect(f.onSnapshot).toHaveBeenCalledOnce()
    f.runtime.close()
})

it.each(['close', 'disconnect'] as const)('cancels recovery timers on %s', async (action) => {
    const f = setup()
    const invalid: Extract<ServerMessage, { type: 'snapshot_delta' }> = {
        type: 'snapshot_delta',
        streamId: 2,
        seq: 1,
        baseSeq: 0,
        tick: 2,
        serverTime: 100050,
        stepMs: 50,
    }
    f.emit(invalid)
    expect(f.resyncs()).toHaveLength(1)
    if (action === 'close') f.runtime.close()
    else f.socket.dispatchEvent(new Event('close'))
    await vi.advanceTimersByTimeAsync(9000)
    expect(f.resyncs()).toHaveLength(1)
})
