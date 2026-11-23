import { FARM_GROW_MS, FARM_PLOTS } from '@my-game-ratata/contracts'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { parseNpcAiConfig } from '../src/ai/config'
import { createItemInstance } from '../src/game/inventory'
import { GameRoom } from '../src/game/room'
import type { RoomSocket } from '../src/game/roomMessaging'
import { controlledNpcProvider, npcReply } from './npcAiRuntimeFixture'
import { joinScenarioRoom } from './scenarioRoomHelpers'

let room: GameRoom

beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    room = new GameRoom(undefined, { emptyWorldMode: 'paused_when_empty' })
    room.start()
})

afterEach(() => {
    room.stop()
    vi.useRealTimers()
})

it('freezes logical time and ticks until a successful player join', () => {
    const first = room.snapshot()
    room.handleOpen({ send: vi.fn() } as unknown as RoomSocket)
    vi.advanceTimersByTime(600_000)
    expect(room.snapshot()).toMatchObject({
        serverTime: first.serverTime,
        tick: first.tick,
    })
    expect(room.decideForAgent('npc_guard_1', { type: 'wait' }).accepted).toBe(
        false
    )

    const alice = joinScenarioRoom(room, 'World clock Alice')
    const init = alice.sent.find((message) => message.type === 'world_init')
    expect(init?.snapshot.serverTime).toBe(first.serverTime)
    expect(room.allowsAutonomousNpcAi()).toBe(true)
    vi.advanceTimersByTime(250)
    expect(room.snapshot().serverTime).toBe(first.serverTime + 250)
    expect(room.snapshot().tick).toBe(first.tick + 5)
})

it('uses joined presence and applies changes to an empty room immediately', () => {
    const alice = joinScenarioRoom(room, 'World clock Alice')
    const bob = joinScenarioRoom(room, 'World clock Bob')
    room.handleClose(alice.socket)
    expect(room.allowsAutonomousNpcAi()).toBe(true)
    vi.advanceTimersByTime(100)
    room.handleClose(bob.socket)
    const paused = room.snapshot()
    expect(room.allowsAutonomousNpcAi()).toBe(false)
    vi.advanceTimersByTime(100)
    expect(room.snapshot().tick).toBe(paused.tick)

    room.setEmptyWorldMode('online_ai')
    expect(room.allowsAutonomousNpcAi()).toBe(false)
    vi.advanceTimersByTime(100)
    expect(room.snapshot().serverTime).toBe(paused.serverTime + 100)

    room.setEmptyWorldMode('always')
    expect(room.allowsAutonomousNpcAi()).toBe(true)
    vi.advanceTimersByTime(100)
    room.setEmptyWorldMode('paused_when_empty')
    expect(room.allowsAutonomousNpcAi()).toBe(false)
    const pausedAgain = room.gameplayNow()
    vi.advanceTimersByTime(30_000)
    const rejoined = joinScenarioRoom(room, 'World clock Bob')
    expect(rejoined.actor.id).toBe(bob.actor.id)
    expect(room.gameplayNow()).toBe(pausedAgain)
})

it('keeps the remaining growth time of an actual shared farm plot', () => {
    const plot = FARM_PLOTS.find(({ initiallyRipe }) => initiallyRipe !== true)
    if (plot === undefined) {
        throw new Error('Missing bare farm plot')
    }
    const player = joinScenarioRoom(room, 'World clock farmer')
    // Arrange the farm contact; use the normal server command for sowing.
    player.actor.locationId = plot.locationId
    player.actor.position = { ...plot.position }
    player.actor.inventory.push(createItemInstance('wheat_seed'))
    player.send({ type: 'farm_action', plotId: plot.id, action: 'sow' })
    const view = () =>
        room
            .adventureForWorkers()
            .farmSnapshot(plot.locationId, room.gameplayNow())
            .find(({ id }) => id === plot.id)
    const readyAt = room.gameplayNow() + FARM_GROW_MS
    expect(view()).toMatchObject({ phase: 'growing', readyAt })

    room.handleClose(player.socket)
    vi.advanceTimersByTime(600_000)
    expect(view()).toMatchObject({ phase: 'growing', readyAt })
    joinScenarioRoom(room, 'World clock farmer')
    vi.setSystemTime(Date.now() + FARM_GROW_MS - 1)
    expect(view()?.phase).toBe('growing')
    vi.setSystemTime(Date.now() + 1)
    expect(view()?.phase).toBe('ripe')
})

it('suspends uncommitted AI when an administrator changes an empty world’s mode', async () => {
    room.stop()
    const provider = controlledNpcProvider()
    room = new GameRoom(undefined, {
        emptyWorldMode: 'online_ai',
        ai: {
            config: parseNpcAiConfig(
                {
                    npcs: [
                        {
                            actorId: 'npc_friendly_girl_1',
                            role: 'city_coordinator',
                        },
                    ],
                },
                true
            ),
            provider,
        },
    })
    room.start()
    await vi.advanceTimersByTimeAsync(150)
    expect(provider.turns).toHaveLength(0)

    room.setEmptyWorldMode('always')
    await vi.advanceTimersByTimeAsync(150)
    expect(provider.turns).toHaveLength(1)
    const pending = provider.turns[0]
    room.setEmptyWorldMode('paused_when_empty')
    expect(pending?.signal.aborted).toBe(true)
    pending?.resolve(npcReply({ type: 'speak', text: 'Старое решение' }))
    const paused = room.snapshot()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(room.snapshot().tick).toBe(paused.tick)
    expect(provider.turns).toHaveLength(1)
})
