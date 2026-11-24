import { normalizeSnapshot } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { sendSnapshot, sendWorldInit } from '../src/game/roomMessaging'
import { snapshotStream } from '../src/game/snapshotStreamState'
import {
    initialMessage,
    required,
    streamFixture,
} from './snapshotStreamFixture'
import { receivedSnapshot } from './snapshotTestHelpers'

const scope = { playerId: 'hero', stepMs: 50 }

describe('accepted snapshot baselines', () => {
    it('seeds the exact detached initial wire image and sends field changes only', () => {
        const f = streamFixture()
        const initial = f.snapshot()
        required(initial.characters[0]).velocity.x = Number.NaN
        expect(sendWorldInit(f.socket, initialMessage(initial))).toBe(true)
        const init = f.last()
        expect(init.type).toBe('world_init')
        if (init.type !== 'world_init') {
            return
        }
        expect(init.snapshot.stepMs).toBe(0)
        expect(required(init.snapshot.characters[0]).velocity.x).toBeNull()
        expect(snapshotStream(f.socket).baseline).toEqual(init.snapshot)
        expect(snapshotStream(f.socket).baseline).not.toBe(initial)

        // The live model and previous snapshot share mutable internal state.
        const next = f.snapshot(2)
        required(next.characters[0]).cooldowns.attackMsLeft = 37
        sendSnapshot(f.socket, () => next, scope)
        const delta = f.last()
        expect(delta.type).toBe('snapshot_delta')
        if (delta.type !== 'snapshot_delta') {
            return
        }
        expect(delta).toMatchObject({
            streamId: 1,
            baseSeq: 0,
            seq: 1,
            stepMs: 50,
        })
        expect(JSON.stringify(delta.patch)).toContain('attackMsLeft')
        expect(JSON.stringify(delta.patch)).not.toContain('position')
        expect(receivedSnapshot(f.frames)).toEqual(normalizeSnapshot(next))
    })

    it('detaches every accepted baseline from mutable server objects', () => {
        const f = streamFixture()
        const current = f.snapshot()
        sendSnapshot(f.socket, () => current, scope)
        const base = required(snapshotStream(f.socket).baseline)
        required(current.characters[0]).position.x = 222
        current.tick = 2
        current.serverTime = 100
        sendSnapshot(f.socket, () => current, scope)
        expect(required(base.characters[0]).position.x).toBe(100)
        expect(f.last().type).toBe('snapshot_delta')
        expect(
            required(receivedSnapshot(f.frames).characters[0]).position.x
        ).toBe(222)
    })
})

describe('native snapshot transport', () => {
    it.each([1, 1024, -1])(
        'commits native acceptance status %i exactly once',
        (status) => {
            const f = streamFixture()
            f.send.mockReturnValue(status)
            sendSnapshot(f.socket, () => f.snapshot(), scope)
            expect(snapshotStream(f.socket)).toMatchObject({
                streamId: 1,
                seq: 0,
            })
            sendSnapshot(f.socket, () => f.snapshot(2), scope)
            expect(snapshotStream(f.socket)).toMatchObject({
                streamId: 1,
                seq: 1,
            })
        }
    )

    it('never advances the base on native drop, then catches up from the accepted base', () => {
        const f = streamFixture()
        sendSnapshot(f.socket, () => f.snapshot(), scope)
        const baseline = snapshotStream(f.socket).baseline
        f.send.mockReturnValueOnce(0)
        sendSnapshot(f.socket, () => f.snapshot(2), scope)
        expect(snapshotStream(f.socket).baseline).toBe(baseline)
        expect(snapshotStream(f.socket).seq).toBe(0)
        sendSnapshot(f.socket, () => f.snapshot(3), scope)
        expect(f.last()).toMatchObject({
            type: 'snapshot_delta',
            baseSeq: 0,
            seq: 1,
            tick: 3,
        })
    })

    it('sends tiny time headers and preserves shared stationary trees after reconstruction', () => {
        const f = streamFixture()
        sendSnapshot(f.socket, () => f.snapshot(), scope)
        const previous = receivedSnapshot(f.frames)
        sendSnapshot(f.socket, () => f.snapshot(2), scope)
        expect(f.last()).toEqual({
            type: 'snapshot_delta',
            streamId: 1,
            baseSeq: 0,
            seq: 1,
            tick: 2,
            serverTime: 100,
            stepMs: 50,
        })
        const next = receivedSnapshot(f.frames)
        expect(next.characters).toBe(previous.characters)
        expect(next.tick).toBe(2)
    })

    it('skips projection behind the queue and sends fresh data when it drains', () => {
        const f = streamFixture()
        sendSnapshot(f.socket, () => f.snapshot(), scope)
        let projected = 0
        f.getBufferedAmount.mockReturnValue(100)
        sendSnapshot(
            f.socket,
            () => {
                projected++
                return f.snapshot(2)
            },
            scope
        )
        expect(projected).toBe(0)
        f.getBufferedAmount.mockReturnValue(0)
        sendSnapshot(f.socket, () => f.snapshot(3), scope)
        expect(f.last()).toMatchObject({
            type: 'snapshot_delta',
            tick: 3,
            baseSeq: 0,
        })
    })

    it('contains throwing transports to their socket and leaves other streams working', () => {
        const bad = streamFixture('bad')
        const good = streamFixture('good')
        bad.send.mockImplementation(() => {
            throw new Error('closed')
        })
        expect(() =>
            sendSnapshot(bad.socket, () => bad.snapshot(), scope)
        ).not.toThrow()
        expect(bad.close).toHaveBeenCalledOnce()
        expect(snapshotStream(bad.socket).baseline).toBeUndefined()
        sendSnapshot(good.socket, () => good.snapshot(), scope)
        expect(snapshotStream(good.socket).seq).toBe(0)
    })

    it.each([0, -2])(
        'does not initialize or allocate a stream on status %i',
        (status) => {
            const f = streamFixture()
            f.send.mockReturnValue(status)
            expect(sendWorldInit(f.socket, initialMessage(f.snapshot()))).toBe(
                false
            )
            expect(snapshotStream(f.socket)).toMatchObject({
                streamId: 0,
                seq: -1,
                baseline: undefined,
            })
            f.send.mockReturnValue(1)
            expect(sendWorldInit(f.socket, initialMessage(f.snapshot(2)))).toBe(
                true
            )
            expect(snapshotStream(f.socket)).toMatchObject({
                streamId: 1,
                seq: 0,
            })
        }
    )
})

describe('snapshot privacy', () => {
    it('keeps per-socket visibility and bases isolated', () => {
        const owner = streamFixture('owner')
        const other = streamFixture('other')
        const secret = owner.snapshot()
        secret.items = [{ id: 'private-item' }] as typeof secret.items
        sendSnapshot(owner.socket, () => secret, scope)
        sendSnapshot(other.socket, () => other.snapshot(), {
            playerId: 'observer',
            stepMs: 50,
        })
        sendSnapshot(
            owner.socket,
            () => ({ ...secret, tick: 2, serverTime: 100 }),
            scope
        )
        sendSnapshot(other.socket, () => other.snapshot(2), {
            playerId: 'observer',
            stepMs: 50,
        })
        expect(JSON.stringify(other.frames)).not.toContain('private-item')
        expect(receivedSnapshot(owner.frames).items).toEqual(secret.items)
        expect(receivedSnapshot(other.frames).items).toEqual([])
    })
})
