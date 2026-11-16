import type { ServerMessage } from '@my-game-ratata/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { EconomyWorkerController } from '../src/game/economyWorkers'
import { GameRoom } from '../src/game/room'
import type { RoomSocket } from '../src/game/roomMessaging'
import { ScenarioPolicies } from '../src/game/scenarioPolicies'

function actor(player = false) {
    return new GameCharacter({
        id: 'policy-actor',
        nickname: 'Actor',
        archetype: 'human',
        faction: 'peaceful',
        controllerKind: player ? 'network_player' : 'scripted',
        spawnPosition: { x: 80, y: 80 },
    })
}

describe('server-owned baseline policy intention tasks', () => {
    it('executes one bounded registered strategy task per actor and tick', () => {
        const policies = new ScenarioPolicies(),
            npc = actor(),
            controller = { update: vi.fn() },
            room = {} as GameRoom
        expect(policies.advance(npc, controller, room, 5000)).toBe(true)
        expect(policies.advance(npc, controller, room, 5000)).toBe(false)
        expect(controller.update).toHaveBeenCalledExactlyOnceWith(
            npc,
            room,
            5000
        )
        expect(policies.advance(npc, controller, room, 5050)).toBe(true)
        expect(controller.update).toHaveBeenCalledTimes(2)
    })

    it.each(['human_owner', 'dead', 'retired', 'offline'])(
        'never schedules an unavailable strategy: %s',
        (reason) => {
            const policies = new ScenarioPolicies(),
                npc = actor(reason === 'human_owner'),
                controller = { update: vi.fn() }
            if (reason === 'dead') {
                npc.alive = false
            }
            if (reason === 'retired') {
                npc.tags.add('state.retired')
            }
            if (reason === 'offline') {
                npc.tags.add('offline')
            }
            expect(
                policies.advance(npc, controller, {} as GameRoom, 5000)
            ).toBe(false)
            expect(controller.update).not.toHaveBeenCalled()
        }
    )

    it('forgets task bookkeeping when an identity disappears', () => {
        const policies = new ScenarioPolicies(),
            first = actor(),
            controller = { update: vi.fn() }
        policies.advance(first, controller, {} as GameRoom, 5000)
        policies.reconcile(new Map())
        expect(
            policies.advance(actor(), controller, {} as GameRoom, 5000)
        ).toBe(true)
        expect(controller.update).toHaveBeenCalledTimes(2)
    })
})

afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

describe('common scheduler ownership over retained NPC policies', () => {
    it.each(['scenario', 'paused_scenario', 'conversation', 'control'])(
        'does not run the worker fallback while %s owns the actor',
        (hold) => {
            vi.stubGlobal('Bun', { env: {} })
            vi.useFakeTimers()
            vi.setSystemTime(1000)
            const room = new GameRoom()
            const worker = room.getCharacter('npc_lumberjack_1')
            if (worker === undefined) {
                throw new Error('Missing worker')
            }
            const policy = vi.spyOn(EconomyWorkerController.prototype, 'update')
            if (hold === 'scenario' || hold === 'paused_scenario') {
                room.scenarios.registerDefault(
                    worker,
                    {
                        id: 'hold',
                        name: 'Hold',
                        repeat: null,
                        threat: 'continue',
                        steps: [
                            { id: 'wait', kind: 'wait', durationMs: 10_000 },
                        ],
                    },
                    1000
                )
                if (hold === 'paused_scenario') {
                    room.scenarios.pause(worker)
                }
            } else if (hold === 'conversation') {
                const sent: ServerMessage[] = []
                const socket = {
                    send: (payload: string) =>
                        sent.push(JSON.parse(payload) as ServerMessage),
                } as unknown as RoomSocket
                room.handleOpen(socket)
                room.handleMessage(
                    socket,
                    JSON.stringify({ type: 'join', nickname: 'Talker' })
                )
                const init = sent.find(
                    (message) => message.type === 'world_init'
                )
                const player = room.getCharacter(init?.playerId ?? '')
                if (player === undefined) {
                    throw new Error('Missing player')
                }
                player.position = { ...worker.position }
                room.handleMessage(
                    socket,
                    JSON.stringify({ type: 'interact', targetId: worker.id })
                )
                expect(
                    room.snapshot(1000, player.locationId, player.id).adventure
                        ?.dialogue?.npcId
                ).toBe(worker.id)
            } else {
                expect(
                    room.decideForAgent(worker.id, {
                        type: 'move',
                        axis: { x: 1, y: 0 },
                    }).accepted
                ).toBe(true)
            }
            room.start()
            vi.advanceTimersByTime(100)
            room.stop()
            expect(
                policy.mock.calls.filter(
                    ([character]) => character.id === worker.id
                )
            ).toHaveLength(0)
        }
    )
})
