import type { ServerMessage } from '@my-game-ratata/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
    cancelCharacterControl,
    snapshotControl,
} from '../src/game/characterControl'
import {
    enqueueCharacterRoute,
    MAX_ROUTE_POINTS,
} from '../src/game/characterRoute'
import { parseClientMessage } from '../src/game/messages'
import { GameRoom } from '../src/game/room'
import type { RoomSocket } from '../src/game/roomMessaging'
import { routeFixture as setup } from './routeTestHelpers'

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

describe('authoritative click routes', () => {
    it('walks three exact destinations in order and keeps their original numbers', () => {
        const { actor, navigation, tick } = setup()
        enqueueCharacterRoute(actor, { x: 99, y: 40 }, false, navigation, 0)
        enqueueCharacterRoute(actor, { x: 99, y: 101 }, true, navigation, 0)
        enqueueCharacterRoute(actor, { x: 43, y: 101 }, true, navigation, 0)
        const reached: number[] = []
        for (let now = 50; now <= 10_000; now += 50) {
            const before = snapshotControl(actor).route?.points[0]?.number
            tick(now)
            const after = snapshotControl(actor).route?.points[0]?.number
            if (before !== undefined && before !== after) {
                reached.push(before)
            }
            if (snapshotControl(actor).mode === 'none') {
                break
            }
        }
        expect(reached).toEqual([1, 2, 3])
        expect(actor.position).toEqual({ x: 43, y: 101 })
        expect(snapshotControl(actor).mode).toBe('none')
    })

    it('replaces a route, bounds appends and releases it on explicit cancellation', () => {
        const { actor, navigation } = setup()
        for (let index = 0; index < MAX_ROUTE_POINTS; index++) {
            expect(
                enqueueCharacterRoute(
                    actor,
                    { x: 120, y: 40 },
                    index > 0,
                    navigation,
                    0
                ).accepted
            ).toBe(true)
        }
        expect(
            enqueueCharacterRoute(actor, { x: 80, y: 40 }, true, navigation, 0)
        ).toEqual({ accepted: false, reason: 'full' })
        expect(snapshotControl(actor).route?.points).toHaveLength(
            MAX_ROUTE_POINTS
        )
        enqueueCharacterRoute(actor, { x: 70, y: 90 }, false, navigation, 0)
        expect(snapshotControl(actor).route?.points).toEqual([
            { number: 1, position: { x: 70, y: 90 } },
        ])
        cancelCharacterControl(actor)
        expect(snapshotControl(actor).mode).toBe('none')
        expect(actor.hasPath()).toBe(false)
        expect(actor.getMoveInput()).toEqual({ x: 0, y: 0 })
    })

    it('waits ten seconds without progress then cancels all remaining points once', () => {
        const { actor, navigation, control, publishEvents, divideMap } = setup()
        const blocked = { x: 120, y: 40 }
        enqueueCharacterRoute(actor, blocked, false, navigation, 0)
        enqueueCharacterRoute(actor, { x: 40, y: 80 }, true, navigation, 0)
        divideMap()
        actor.clearPath()
        expect(navigation.findPathWorld(actor.position, blocked)).toEqual([])
        control(9_999)
        expect(actor.position).toEqual({ x: 40, y: 40 })
        expect(snapshotControl(actor).route?.points[0]?.number).toBe(1)
        expect(snapshotControl(actor).route).toMatchObject({
            waiting: 'blocked',
            remainingFailureMs: 1,
        })
        control(10_000)
        expect(snapshotControl(actor).mode).toBe('none')
        expect(actor.hasPath()).toBe(false)
        expect(publishEvents).toHaveBeenCalledOnce()
        expect(publishEvents.mock.calls[0]?.[0]).toEqual([
            expect.objectContaining({
                kind: 'notice',
                audienceIds: [actor.id],
                text: 'Маршрут отменён: к точке 1 нет прохода',
            }),
        ])
        control(20_000)
        expect(publishEvents).toHaveBeenCalledOnce()
    })
})

describe('route validation and privacy', () => {
    it.each(['stunUntil', 'actionLockUntil'] as const)(
        'freezes remaining failure time during %s',
        (deadline) => {
            const { actor, navigation, control, divideMap } = setup()
            enqueueCharacterRoute(
                actor,
                { x: 120, y: 40 },
                false,
                navigation,
                0
            )
            divideMap()
            actor.clearPath()
            control(9_000)
            actor[deadline] = 20_000
            control(19_999)
            expect(snapshotControl(actor).route?.remainingFailureMs).toBe(1000)
            expect(snapshotControl(actor).route?.points[0]?.number).toBe(1)
            control(20_000)
            expect(snapshotControl(actor).route?.points[0]?.number).toBe(1)
            control(20_999)
            expect(snapshotControl(actor).mode).toBe('none')
        }
    )

    it('parses optional append and rejects non-boolean values', () => {
        expect(
            parseClientMessage(
                '{"type":"move_to","target":{"x":10,"y":20},"append":true}'
            ).message
        ).toMatchObject({ append: true })
        expect(
            parseClientMessage('{"type":"move_to","target":{"x":10,"y":20}}')
                .message
        ).toEqual({ type: 'move_to', target: { x: 10, y: 20 } })
        expect(
            parseClientMessage(
                '{"type":"move_to","target":{"x":10,"y":20},"append":"yes"}'
            ).error
        ).toBeDefined()
    })

    it('only sends the route to its owning observer', () => {
        vi.stubGlobal('Bun', { env: {} })
        const { navigation } = setup()
        const room = new GameRoom(navigation)
        const sent: ServerMessage[] = []
        const socket = {
            send: (payload: string) =>
                sent.push(JSON.parse(payload) as ServerMessage),
        } as unknown as RoomSocket
        room.handleOpen(socket)
        room.handleMessage(
            socket,
            JSON.stringify({ type: 'join', nickname: 'Route owner' })
        )
        const init = sent.find((message) => message.type === 'world_init')
        if (init === undefined) {
            throw new Error('Missing player')
        }
        const actor = room.getCharacter(init.playerId)
        if (actor === undefined) {
            throw new Error('Missing character')
        }
        room.handleMessage(
            socket,
            JSON.stringify({ type: 'move_to', target: { x: 80, y: 80 } })
        )
        expect(
            room
                .snapshot(Date.now(), actor.locationId, actor.id)
                .characters.find((entry) => entry.id === actor.id)?.control
                ?.route?.points
        ).toHaveLength(1)
        expect(
            room
                .snapshot(Date.now(), actor.locationId)
                .characters.find((entry) => entry.id === actor.id)?.control
        ).toEqual({ mode: 'none', targetId: null })
        room.stop()
    })
})
