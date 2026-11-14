import type { ServerMessage } from '@my-game-ratata/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { GameCharacter } from '../src/game/character'
import {
    advanceCharacterControl,
    cancelCharacterControl,
    snapshotControl,
} from '../src/game/characterControl'
import {
    enqueueCharacterRoute,
    MAX_ROUTE_POINTS,
} from '../src/game/characterRoute'
import type { ControlWorld } from '../src/game/controlWorld'
import { parseClientMessage } from '../src/game/messages'
import { advanceCharacter } from '../src/game/movement'
import { NavigationService } from '../src/game/navigation'
import { GameRoom } from '../src/game/room'
import type { RoomSocket } from '../src/game/roomMessaging'

function setup() {
    const navigation = new NavigationService({
        id: 'route-test',
        width: 20,
        height: 20,
        tileWidth: 16,
        tileHeight: 16,
        solid: new Array<boolean>(400).fill(false),
        solidLayerNames: [],
    })
    const actor = new GameCharacter({
        id: 'hero',
        nickname: 'Hero',
        archetype: 'human',
        controllerKind: 'network_player',
        spawnPosition: { x: 40, y: 40 },
    })
    const publishEvents = vi.fn<NonNullable<ControlWorld['publishEvents']>>()
    const world: ControlWorld = {
        navigationFor: () => navigation,
        getCharacter: () => undefined,
        requestAttack: () => undefined,
        publishEvents,
    }
    const tick = (now: number) => {
        advanceCharacterControl(actor, world, now)
        advanceCharacter({ character: actor, navigation, now, deltaMs: 50 })
    }
    return { actor, navigation, world, publishEvents, tick }
}

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
                )
            ).toBe(true)
        }
        expect(
            enqueueCharacterRoute(actor, { x: 80, y: 40 }, true, navigation, 0)
        ).toBe(false)
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

    it('waits ten seconds without progress before skipping an unreachable free cell', () => {
        const { actor, navigation, tick, publishEvents } = setup()
        for (let y = 0; y < 20; y++) {
            navigation.grid.solid[y * 20 + 5] = true
        }
        const blocked = { x: 120, y: 40 }
        expect(navigation.findPathWorld(actor.position, blocked)).toEqual([])
        enqueueCharacterRoute(actor, blocked, false, navigation, 0)
        enqueueCharacterRoute(actor, { x: 40, y: 80 }, true, navigation, 0)
        tick(9_999)
        expect(actor.position).toEqual({ x: 40, y: 40 })
        expect(snapshotControl(actor).route?.points[0]?.number).toBe(1)
        tick(10_000)
        expect(snapshotControl(actor).route?.points[0]?.number).toBe(2)
        expect(publishEvents).toHaveBeenCalledOnce()
        for (let now = 10_050; now <= 12_000; now += 50) {
            tick(now)
        }
        expect(
            Math.hypot(actor.position.x - 40, actor.position.y - 80)
        ).toBeLessThanOrEqual(1)
    })
})

describe('route validation and privacy', () => {
    it('freezes remaining failure time while stunned', () => {
        const { actor, navigation, tick } = setup()
        navigation.grid.solid[2 * 20 + 6] = true
        enqueueCharacterRoute(actor, { x: 104, y: 40 }, false, navigation, 0)
        tick(9_000)
        actor.stunUntil = 20_000
        tick(19_999)
        expect(snapshotControl(actor).route?.points[0]?.number).toBe(1)
        tick(20_000)
        expect(snapshotControl(actor).route?.points[0]?.number).toBe(1)
        tick(20_999)
        expect(snapshotControl(actor).mode).toBe('none')
    })

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
