import type { ServerMessage } from '@my-game-ratata/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { applyAgentDecision } from '../src/game/agentDecisions'
import { snapshotControl } from '../src/game/characterControl'
import { NavigationService } from '../src/game/navigation'
import { GameRoom } from '../src/game/room'
import type { RoomSocket } from '../src/game/roomMessaging'
import { routeCommandFixture } from './routeCommandFixture'
import { joinScenarioRoom, roomScenario } from './scenarioRoomHelpers'

beforeEach(() => {
    vi.stubGlobal('Bun', { env: {} })
    vi.useFakeTimers()
    vi.setSystemTime(1000)
})
afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    vi.restoreAllMocks()
})

function roomFixture() {
    const navigation = new NavigationService({
        id: 'map-2-2',
        width: 40,
        height: 40,
        tileWidth: 16,
        tileHeight: 16,
        solid: Array<boolean>(1600).fill(false),
        solidLayerNames: [],
    })
    const room = new GameRoom(navigation)
    for (let y = 27; y <= 33; y++) {
        for (let x = 27; x <= 33; x++) {
            navigation.grid.solid[y * 40 + x] = true
        }
    }
    return {
        room,
        navigation,
        blocked: navigation.tileToWorld({ x: 30, y: 30 }),
    }
}

describe('route commands through authenticated room connections', () => {
    it('leaves a running scenario untouched on rejection and pauses it only when a new route starts', () => {
        const { room, navigation, blocked } = roomFixture()
        const owner = joinScenarioRoom(room, 'Route scenario owner')
        const guest = joinScenarioRoom(room, 'Route scenario guest')
        try {
            owner.save(
                roomScenario(
                    'pending-work',
                    [{ id: 'wait', kind: 'wait', durationMs: 10000 }],
                    null
                )
            )
            owner.send({ type: 'scenario_start', scenarioId: 'pending-work' })
            const previous = structuredClone(owner.view().run)
            expect(previous?.status).toBe('running')
            owner.sent.length = 0
            guest.sent.length = 0
            owner.send({ type: 'move_to', target: blocked })
            expect(owner.view().run).toEqual(previous)
            expect(snapshotControl(owner.actor).mode).toBe('none')
            const notices = owner.sent.filter(
                (message) =>
                    message.type === 'event' && message.event.kind === 'notice'
            )
            expect(notices).toHaveLength(1)
            expect(notices[0]).toMatchObject({
                event: {
                    text: 'Не удалось поставить точку: рядом нет прохода.',
                },
            })
            expect(guest.sent).toEqual([])
            const target = navigation.tileToWorld({ x: 5, y: 1 })
            owner.send({ type: 'move_to', target })
            expect(owner.view().run?.status).toBe('paused')
            expect(snapshotControl(owner.actor).route?.points).toEqual([
                { number: 1, position: target },
            ])
            expect(owner.actor.remainingPath().at(-1)).toEqual(target)
        } finally {
            room.stop()
        }
    })

    it('ignores supplied owner IDs and rejects unjoined or disconnected sockets without changing another actor', () => {
        const { room } = roomFixture()
        const owner = joinScenarioRoom(room, 'Route authority owner')
        const guest = joinScenarioRoom(room, 'Route authority guest')
        try {
            guest.send({ type: 'move_to', target: { x: 120, y: 136 } })
            const guestControl = structuredClone(snapshotControl(guest.actor))
            room.handleMessage(
                owner.socket,
                JSON.stringify({
                    type: 'move_to',
                    actorId: guest.actor.id,
                    playerId: guest.actor.id,
                    target: { x: 120, y: 24 },
                })
            )
            expect(snapshotControl(guest.actor)).toEqual(guestControl)
            expect(snapshotControl(owner.actor).route?.points).toEqual([
                { number: 1, position: { x: 120, y: 24 } },
            ])
            const sent: ServerMessage[] = []
            const socket = {
                send: (payload: string) =>
                    sent.push(JSON.parse(payload) as ServerMessage),
            } as RoomSocket
            room.handleOpen(socket)
            const command = JSON.stringify({
                type: 'move_to',
                actorId: guest.actor.id,
                target: { x: 56, y: 56 },
            })
            room.handleMessage(socket, command)
            expect(sent).toContainEqual({
                type: 'error',
                code: 'not_joined',
                message: 'Join the room before sending input',
            })
            expect(snapshotControl(guest.actor)).toEqual(guestControl)
            room.handleClose(owner.socket)
            const afterDisconnect = structuredClone(
                snapshotControl(owner.actor)
            )
            room.handleMessage(owner.socket, command)
            expect(snapshotControl(owner.actor)).toEqual(afterDisconnect)
            expect(snapshotControl(guest.actor)).toEqual(guestControl)
        } finally {
            room.stop()
        }
    })
})

it('cannot use the agent adapter to replace a human-controlled route or prayer', () => {
    const f = routeCommandFixture('player')
    f.command({ x: 120, y: 40 })
    f.prayer()
    const before = f.read()
    const result = applyAgentDecision(
        f.actor,
        { type: 'move_to', target: { x: 80, y: 120 } },
        f.world,
        1500
    )
    expect(result).toMatchObject({
        accepted: false,
        error: 'Human control cannot be replaced',
    })
    expect(f.read()).toEqual(before)
})
