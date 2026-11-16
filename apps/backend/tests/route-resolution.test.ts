import { describe, expect, it, vi } from 'vitest'

import {
    cancelCharacterControl,
    snapshotControl,
} from '../src/game/characterControl'
import { enqueueCharacterRoute } from '../src/game/characterRoute'
import { routeFixture } from './routeTestHelpers'

describe('authoritative route destination binding', () => {
    it('puts the marker at the resolved destination and completes only after walking there', () => {
        const f = routeFixture()
        const requested = { x: 104, y: 40 }
        f.navigation.grid.solid[2 * 20 + 6] = true
        const result = enqueueCharacterRoute(
            f.actor,
            requested,
            false,
            f.navigation,
            0
        )
        expect(result).toEqual({
            accepted: true,
            adjusted: true,
            point: { number: 1, position: { x: 88, y: 40 } },
        })
        expect(f.actor.position).toEqual({ x: 40, y: 40 })
        expect(snapshotControl(f.actor).route?.points).toEqual([
            { number: 1, position: { x: 88, y: 40 } },
        ])
        expect(snapshotControl(f.actor).route?.points[0]).not.toHaveProperty(
            'requestedPosition'
        )
        for (let now = 50; now <= 2000; now += 50) {
            f.tick(now)
        }
        expect(f.actor.position).toEqual({ x: 88, y: 40 })
        expect(snapshotControl(f.actor).mode).toBe('none')
    })

    it('validates an append from the last resolved goal without replacing the current path', () => {
        const f = routeFixture()
        f.navigation.grid.solid[2 * 20 + 6] = true
        enqueueCharacterRoute(
            f.actor,
            { x: 104, y: 40 },
            false,
            f.navigation,
            0
        )
        const path = f.actor.remainingPath()
        const findPath = vi.spyOn(f.navigation, 'findPathWorld')
        const setPath = vi.spyOn(f.actor, 'setPath')
        const beforeStart = vi.fn<() => void>()
        const result = enqueueCharacterRoute(
            f.actor,
            { x: 152, y: 40 },
            true,
            f.navigation,
            1,
            beforeStart
        )
        expect(result.accepted).toBe(true)
        expect(findPath.mock.calls[0]).toEqual([
            { x: 88, y: 40 },
            { x: 152, y: 40 },
        ])
        expect(setPath).not.toHaveBeenCalled()
        expect(beforeStart).not.toHaveBeenCalled()
        expect(f.actor.remainingPath()).toEqual(path)
    })
})

describe('route queue transactions', () => {
    it('rejects invalid appends and replacements atomically, preserving the queue and numbering', () => {
        const f = routeFixture()
        enqueueCharacterRoute(
            f.actor,
            { x: 120, y: 40 },
            false,
            f.navigation,
            0
        )
        const before = snapshotControl(f.actor)
        const path = f.actor.remainingPath()
        for (let y = 10; y <= 14; y++) {
            for (let x = 10; x <= 14; x++) {
                f.navigation.grid.solid[y * 20 + x] = true
            }
        }
        const beforeStart = vi.fn<() => void>(() =>
            cancelCharacterControl(f.actor)
        )
        const unreachable = { x: 200, y: 200 }
        for (const append of [false, true]) {
            expect(
                enqueueCharacterRoute(
                    f.actor,
                    unreachable,
                    append,
                    f.navigation,
                    1,
                    beforeStart
                )
            ).toEqual({ accepted: false, reason: 'unreachable' })
            expect(snapshotControl(f.actor)).toEqual(before)
            expect(f.actor.remainingPath()).toEqual(path)
        }
        expect(beforeStart).not.toHaveBeenCalled()
        f.navigation.grid.solid.fill(false)
        expect(
            enqueueCharacterRoute(
                f.actor,
                { x: 40, y: 80 },
                true,
                f.navigation,
                2
            )
        ).toMatchObject({ accepted: true, point: { number: 2 } })
    })

    it('calls replacement cancellation only after validation and uses the already computed path', () => {
        const f = routeFixture()
        enqueueCharacterRoute(
            f.actor,
            { x: 120, y: 40 },
            false,
            f.navigation,
            0
        )
        const findPath = vi.spyOn(f.navigation, 'findPathWorld')
        const beforeStart = vi.fn<() => void>(() => {
            expect(findPath).toHaveBeenCalledOnce()
            expect(snapshotControl(f.actor).route?.points[0]?.position).toEqual(
                { x: 120, y: 40 }
            )
            cancelCharacterControl(f.actor)
        })
        expect(
            enqueueCharacterRoute(
                f.actor,
                { x: 40, y: 80 },
                false,
                f.navigation,
                1,
                beforeStart
            )
        ).toMatchObject({
            accepted: true,
            adjusted: false,
            point: { number: 1 },
        })
        expect(beforeStart).toHaveBeenCalledOnce()
        expect(findPath).toHaveBeenCalledOnce()
        expect(f.actor.remainingPath().at(-1)).toEqual({ x: 40, y: 80 })
    })
})

describe('runtime route recovery', () => {
    it('resolves again around the original click without moving the actor or resetting failure time', () => {
        const f = routeFixture()
        f.navigation.grid.solid[2 * 20 + 6] = true
        enqueueCharacterRoute(
            f.actor,
            { x: 104, y: 40 },
            false,
            f.navigation,
            0
        )
        f.navigation.grid.solid[2 * 20 + 5] = true
        f.control(500)
        expect(f.actor.position).toEqual({ x: 40, y: 40 })
        expect(snapshotControl(f.actor).route).toMatchObject({
            remainingFailureMs: 9500,
            waiting: 'blocked',
            points: [{ number: 1, position: { x: 104, y: 24 } }],
        })
        expect(f.actor.remainingPath().at(-1)).toEqual({ x: 104, y: 24 })
        expect(f.publishEvents).toHaveBeenCalledOnce()
        expect(f.publishEvents.mock.calls[0]?.[0]).toEqual([
            {
                kind: 'notice',
                actorId: f.actor.id,
                audienceIds: [f.actor.id],
                text: 'Точка 1 перенесена на ближайшее доступное место',
            },
        ])
        f.control(1000)
        expect(f.publishEvents).toHaveBeenCalledOnce()
    })

    it('resets the failure budget only after actual movement when a blocked path recovers', () => {
        const f = routeFixture()
        enqueueCharacterRoute(
            f.actor,
            { x: 120, y: 40 },
            false,
            f.navigation,
            0
        )
        f.divideMap()
        f.actor.clearPath()
        f.control(9000)
        expect(snapshotControl(f.actor).route).toMatchObject({
            remainingFailureMs: 1000,
            waiting: 'blocked',
        })
        f.navigation.grid.solid.fill(false)
        f.control(9500)
        expect(snapshotControl(f.actor).route).toMatchObject({
            remainingFailureMs: 500,
            waiting: 'blocked',
        })
        f.move(9500)
        f.control(9550)
        expect(snapshotControl(f.actor).route).toMatchObject({
            remainingFailureMs: 10000,
            waiting: null,
        })
        expect(f.actor.position.x).toBeGreaterThan(40)
        expect(f.publishEvents).not.toHaveBeenCalled()
    })

    it('does not cancel a long journey while collision-resolved movement continues', () => {
        const f = routeFixture()
        f.actor.config.moveSpeed = 5
        enqueueCharacterRoute(
            f.actor,
            { x: 120, y: 40 },
            false,
            f.navigation,
            0
        )
        for (let now = 50; now <= 11000; now += 50) {
            f.tick(now)
        }
        expect(f.actor.position.x).toBeGreaterThan(90)
        expect(snapshotControl(f.actor).route?.points[0]?.number).toBe(1)
        expect(f.publishEvents).not.toHaveBeenCalled()
    })
})

describe('route state boundaries', () => {
    it('keeps returned coordinates and snapshots detached from the internal requested and actual goals', () => {
        const f = routeFixture()
        f.navigation.grid.solid[2 * 20 + 6] = true
        const requested = { x: 104, y: 40 }
        const result = enqueueCharacterRoute(
            f.actor,
            requested,
            false,
            f.navigation,
            0
        )
        const snapshot = snapshotControl(f.actor).route
        if (!result.accepted || snapshot?.points[0] === undefined) {
            throw new Error('Expected an accepted route')
        }
        requested.x = 300
        result.point.position.x = 300
        snapshot.points[0].position.x = 300
        expect(snapshotControl(f.actor).route?.points[0]?.position).toEqual({
            x: 88,
            y: 40,
        })
        f.navigation.grid.solid[2 * 20 + 5] = true
        f.control(500)
        expect(snapshotControl(f.actor).route?.points[0]?.position).toEqual({
            x: 104,
            y: 24,
        })
    })

    it.each(['dead', 'offline', 'retired'] as const)(
        'rejects an unavailable %s actor without invoking cancellation',
        (state) => {
            const f = routeFixture()
            if (state === 'dead') {
                f.actor.alive = false
            } else {
                f.actor.tags.add(
                    state === 'offline' ? 'offline' : 'state.retired'
                )
            }
            const beforeStart = vi.fn<() => void>()
            expect(
                enqueueCharacterRoute(
                    f.actor,
                    { x: 120, y: 40 },
                    false,
                    f.navigation,
                    0,
                    beforeStart
                )
            ).toEqual({ accepted: false, reason: 'unavailable' })
            expect(beforeStart).not.toHaveBeenCalled()
            expect(f.actor.hasPath()).toBe(false)
        }
    )
})
