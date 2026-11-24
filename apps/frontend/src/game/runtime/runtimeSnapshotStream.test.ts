import {
    CONTRACT_PROTOCOL_VERSION,
    diffSnapshots,
    type ServerMessage,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { characterFixture, worldFixture } from '../testing/characterFixture'
import { RuntimeSnapshotStream, type SnapshotReceipt } from './runtimeSnapshotStream'

type Full = Extract<ServerMessage, { type: 'snapshot' }>
type Initial = Extract<ServerMessage, { type: 'world_init' }>

function state(tick = 1): WorldSnapshot {
    return {
        ...worldFixture([characterFixture('self'), characterFixture('other')]),
        tick,
        serverTime: tick * 50,
        stepMs: 50,
    }
}

function full(snapshot = state(), seq = 1, streamId = 1): Full {
    return { type: 'snapshot', streamId, seq, snapshot }
}

function initial(snapshot = state()): Initial {
    return {
        ...full(snapshot, 0),
        type: 'world_init',
        protocolVersion: CONTRACT_PROTOCOL_VERSION,
        playerId: 'self',
        tickMs: 50,
        map: {
            id: 'map-2-2',
            asset: { url: '/game/map/map1.json', revision: 'test' },
            width: 10,
            height: 10,
            tileWidth: 16,
            tileHeight: 16,
            worldWidth: 160,
            worldHeight: 160,
            solidLayerNames: [],
        },
    }
}

function delta(
    previous: WorldSnapshot,
    next: WorldSnapshot,
    seq = 1,
    baseSeq = seq - 1,
    streamId = 1
): Extract<ServerMessage, { type: 'snapshot_delta' }> {
    const patch = diffSnapshots(previous, next)
    return {
        type: 'snapshot_delta',
        streamId,
        seq,
        baseSeq,
        tick: next.tick,
        serverTime: next.serverTime,
        stepMs: next.stepMs ?? 0,
        ...(patch === undefined ? {} : { patch }),
    }
}

function applied(receipt: SnapshotReceipt): Extract<SnapshotReceipt, { kind: 'applied' }> {
    expect(receipt.kind).toBe('applied')
    if (receipt.kind !== 'applied') throw new Error('Expected decoded state')
    return receipt
}

describe('snapshot stream reconstruction', () => {
    it('changes only touched branches, preserves old published states and freezes development data', () => {
        const stream = new RuntimeSnapshotStream(true)
        const before = state()
        const original = applied(stream.initialize(initial(before))).snapshot
        const next = {
            ...state(2),
            characters: [
                characterFixture('self', { health: { kind: 'percent', percent: 73 } }),
                before.characters[1]!,
            ],
        }
        const decoded = applied(stream.receive(delta(before, next))).snapshot
        expect(decoded).toEqual(next)
        expect(decoded).not.toBe(original)
        expect(decoded.characters[0]?.position).toBe(original.characters[0]?.position)
        expect(decoded.characters[1]).toBe(original.characters[1])
        expect(original.characters[0]?.health).toEqual({ kind: 'percent', percent: 100 })
        expect(Object.isFrozen(decoded.characters[0])).toBe(true)
        before.characters[0]!.position.x = 99
        expect(original.characters[0]!.position.x).toBe(0)
    })

    it('publishes a new clock root while keeping stationary character identities', () => {
        const stream = new RuntimeSnapshotStream()
        const before = state()
        const first = applied(stream.initialize(initial(before))).snapshot
        const next = { ...before, tick: 2, serverTime: 100, stepMs: 25 }
        const second = applied(stream.receive(delta(before, next))).snapshot
        expect(second).toEqual(next)
        expect(second).not.toBe(first)
        expect(second.characters).toBe(first.characters)
        expect(second.characters[0]).toBe(first.characters[0])
    })

    it('coalesces a missing base, holds the last valid state and resumes from a fresh full frame', () => {
        const stream = new RuntimeSnapshotStream()
        const one = state()
        const held = applied(stream.initialize(initial(one))).snapshot
        expect(stream.receive(delta(state(2), state(3), 2))).toEqual({ kind: 'resync' })
        expect(stream.receive(delta(state(3), state(4), 3))).toEqual({ kind: 'ignored' })
        const restored = applied(stream.receive(full(state(5), 4)))
        expect(restored.reset).toBe(false)
        expect(restored.snapshot.tick).toBe(5)
        expect(applied(stream.receive(delta(state(5), state(6), 5))).snapshot.tick).toBe(6)
        expect(held.tick).toBe(1)
    })

    it('ignores stale streams and duplicate sequence numbers without requesting recovery', () => {
        const stream = new RuntimeSnapshotStream()
        stream.initialize(initial())
        expect(applied(stream.receive(full(state(2), 0, 2))).reset).toBe(true)
        expect(stream.receive(full(state(3), 0, 2))).toEqual({ kind: 'ignored' })
        expect(stream.receive(full(state(4), 20, 1))).toEqual({ kind: 'ignored' })
        expect(stream.receive(delta(state(2), state(3), 1, 0, 1))).toEqual({ kind: 'ignored' })
    })

    it('rejects malformed operations atomically, including prototype writes', () => {
        const stream = new RuntimeSnapshotStream()
        const original = applied(stream.initialize(initial())).snapshot
        const frame = delta(state(), state(2))
        frame.patch = JSON.parse('{"set":{"tick":99},"unset":["__proto__"]}') as NonNullable<
            typeof frame.patch
        >
        expect(stream.receive(frame)).toEqual({ kind: 'resync' })
        expect(original.tick).toBe(1)
        expect(({} as Record<string, unknown>)['polluted']).toBeUndefined()
        expect(applied(stream.receive(full(state(3), 2))).snapshot).toEqual(state(3))
    })

    it('recovers a regressed clock only from a self-contained full frame', () => {
        const stream = new RuntimeSnapshotStream()
        stream.initialize(initial(state(10)))
        expect(stream.receive(delta(state(10), state(2)))).toEqual({ kind: 'resync' })
        const recovered = applied(stream.receive(full(state(3), 2)))
        expect(recovered.reset).toBe(true)
        expect(recovered.snapshot.tick).toBe(3)
        expect(applied(stream.receive(delta(state(3), state(4), 3))).snapshot.tick).toBe(4)
    })

    it('clears socket-local baselines and rejects malformed frame metadata', () => {
        const stream = new RuntimeSnapshotStream()
        stream.initialize(initial())
        stream.clear()
        expect(stream.receive(delta(state(), state(2)))).toEqual({ kind: 'resync' })
        expect(stream.initialize({ ...initial(), seq: 1 })).toEqual({ kind: 'resync' })
        expect(stream.initialize(initial({ ...state(), stepMs: 500 }))).toEqual({ kind: 'resync' })
        expect(stream.initialize({ ...initial(), streamId: -1 })).toEqual({ kind: 'resync' })
    })
})
