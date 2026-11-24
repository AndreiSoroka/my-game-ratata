import { describe, expect, it, vi } from 'vitest'

import { requestSnapshotResync, sendSnapshot } from '../src/game/roomMessaging'
import { snapshotStream } from '../src/game/snapshotStreamState'
import { streamFixture } from './snapshotStreamFixture'

const scope = { playerId: 'hero', stepMs: 50 }

describe('mandatory keyframes', () => {
    it.each(['identity', 'epoch', 'location', 'resume'] as const)(
        'resets a %s scope only after native acceptance',
        (change) => {
            const f = streamFixture()
            sendSnapshot(f.socket, () => f.snapshot(), scope)
            const original = snapshotStream(f.socket).streamId
            const snapshot = f.snapshot(2)
            const options = { ...scope, clockResumeRevision: 0 }
            if (change === 'identity') {
                options.playerId = 'other'
            }
            if (change === 'epoch') {
                snapshot.serverEpoch = 'next-world'
            }
            if (change === 'location') {
                snapshot.location = { id: 'next-map' } as NonNullable<
                    typeof snapshot.location
                >
            }
            if (change === 'resume') {
                options.clockResumeRevision = 1
            }
            f.send.mockReturnValueOnce(0)
            sendSnapshot(f.socket, () => snapshot, options)
            expect(snapshotStream(f.socket)).toMatchObject({
                streamId: original,
                seq: 0,
                pendingFull: 'reset',
            })
            sendSnapshot(f.socket, () => ({ ...snapshot, tick: 3 }), options)
            const reset = snapshotStream(f.socket).streamId
            expect(reset).toBeGreaterThan(original)
            expect(f.last()).toMatchObject({
                type: 'snapshot',
                streamId: reset,
                seq: 0,
                snapshot: { tick: 3 },
            })
            sendSnapshot(f.socket, () => ({ ...snapshot, tick: 4 }), options)
            expect(f.last()).toMatchObject({
                type: 'snapshot_delta',
                streamId: reset,
                baseSeq: 0,
                seq: 1,
            })
        }
    )

    it('retries a dropped periodic full even if the next delta would be small', () => {
        const f = streamFixture()
        sendSnapshot(f.socket, () => f.snapshot(), scope)
        const { keyframeAt: due, streamId } = snapshotStream(f.socket)
        expect(due).toBeGreaterThanOrEqual(30_050)
        expect(due).toBeLessThanOrEqual(35_050)
        f.send.mockReturnValueOnce(0)
        sendSnapshot(
            f.socket,
            () => ({ ...f.snapshot(2), serverTime: due }),
            scope
        )
        expect(snapshotStream(f.socket).pendingFull).toBe('periodic')
        sendSnapshot(
            f.socket,
            () => ({ ...f.snapshot(3), serverTime: due + 50 }),
            scope
        )
        expect(f.last()).toMatchObject({
            type: 'snapshot',
            streamId,
            seq: 1,
            snapshot: { tick: 3 },
        })
        expect(snapshotStream(f.socket).pendingFull).toBeUndefined()
    })

    it('retries a size fallback full even after later state shrinks', () => {
        const f = streamFixture()
        sendSnapshot(f.socket, () => f.snapshot(), scope)
        const { streamId } = snapshotStream(f.socket)
        f.send.mockReturnValueOnce(0)
        sendSnapshot(
            f.socket,
            () => ({
                serverEpoch: 'epoch',
                tick: 2,
                serverTime: 100,
                characters: [],
                chests: [],
                items: [],
            }),
            scope
        )
        expect(snapshotStream(f.socket).pendingFull).toBe('size')
        sendSnapshot(f.socket, () => f.snapshot(3), scope)
        expect(f.last()).toMatchObject({
            type: 'snapshot',
            streamId,
            seq: 1,
        })
    })
})

describe('resync and rollback controls', () => {
    it('coalesces resyncs and defers the next forced response without losing fresh state', () => {
        const f = streamFixture()
        sendSnapshot(f.socket, () => f.snapshot(), scope)
        requestSnapshotResync(f.socket, 100)
        requestSnapshotResync(f.socket, 101)
        expect(f.send).toHaveBeenCalledOnce()
        f.send.mockReturnValueOnce(0)
        sendSnapshot(f.socket, () => f.snapshot(2), scope)
        expect(snapshotStream(f.socket).pendingFull).toBe('resync')
        sendSnapshot(f.socket, () => f.snapshot(3), scope)
        expect(f.last()).toMatchObject({
            type: 'snapshot',
            snapshot: { tick: 3 },
            seq: 1,
        })
        requestSnapshotResync(f.socket, 151)
        for (let now = 200; now < 1150; now += 50) {
            requestSnapshotResync(f.socket, now)
            sendSnapshot(
                f.socket,
                () => ({ ...f.snapshot(), tick: now, serverTime: now }),
                scope
            )
            expect(f.last().type).toBe('snapshot_delta')
        }
        sendSnapshot(
            f.socket,
            () => ({ ...f.snapshot(), tick: 99, serverTime: 1150 }),
            scope
        )
        expect(f.last()).toMatchObject({
            type: 'snapshot',
            snapshot: { tick: 99, serverTime: 1150 },
        })
        expect(snapshotStream(f.socket).pendingResync).toBe(false)
    })

    it('can disable deltas inside the new sequenced protocol', () => {
        const f = streamFixture()
        vi.stubEnv('GAME_SNAPSHOT_DELTAS', '0')
        try {
            sendSnapshot(f.socket, () => f.snapshot(), scope)
            const { streamId } = snapshotStream(f.socket)
            sendSnapshot(f.socket, () => f.snapshot(2), scope)
            expect(f.last()).toMatchObject({
                type: 'snapshot',
                streamId,
                seq: 1,
            })
        } finally {
            vi.unstubAllEnvs()
        }
    })

    it('stamps actual bounded step duration instead of the configured tick length', () => {
        const f = streamFixture()
        for (const [index, stepMs] of [
            0,
            1,
            75,
            250,
            251,
            Number.NaN,
        ].entries()) {
            sendSnapshot(f.socket, () => f.snapshot(index + 1), {
                ...scope,
                stepMs,
            })
            const last = f.last()
            const actual =
                last.type === 'snapshot_delta'
                    ? last.stepMs
                    : last.type === 'snapshot'
                      ? last.snapshot.stepMs
                      : -1
            expect(actual).toBe([0, 1, 75, 250, 0, 0][index])
        }
    })
})

it('does not strand resync recovery behind a regressed logical clock', () => {
    const f = streamFixture()
    sendSnapshot(f.socket, () => f.snapshot(20), scope)
    requestSnapshotResync(f.socket, 1000)
    sendSnapshot(f.socket, () => f.snapshot(21), scope)
    expect(snapshotStream(f.socket).lastResyncAt).toBe(1050)
    requestSnapshotResync(f.socket, 100)
    sendSnapshot(f.socket, () => f.snapshot(3), scope)
    expect(f.last()).toMatchObject({
        type: 'snapshot',
        seq: 2,
        snapshot: { serverTime: 150 },
    })
    expect(snapshotStream(f.socket).pendingResync).toBe(false)
})

it('staggers periodic keyframes across real socket identities', () => {
    const first = streamFixture('first-client')
    const second = streamFixture('second-client')
    sendSnapshot(first.socket, () => first.snapshot(), scope)
    sendSnapshot(second.socket, () => second.snapshot(), scope)
    expect(snapshotStream(first.socket).keyframeAt).not.toBe(
        snapshotStream(second.socket).keyframeAt
    )
})
