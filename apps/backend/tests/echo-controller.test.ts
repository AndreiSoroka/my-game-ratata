import type { WorldEmptyMode } from '@my-game-ratata/contracts'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { advanceEchoReturn } from '../src/game/echoReturn'
import { distance } from '../src/game/math'
import { setDeclaredHostility } from '../src/game/personalHostility'
import { GameRoom } from '../src/game/room'
import { roomTickMs } from '../src/game/roomLoop'
import {
    joinScenarioRoom,
    nearbyScenarioPoint,
    roomScenario,
    savedScenarioMarker,
} from './scenarioRoomHelpers'

vi.mock('../src/game/echoReturn', () => ({ advanceEchoReturn: vi.fn() }))

const returning = vi.mocked(advanceEchoReturn)
let room: GameRoom | undefined

beforeEach(() => {
    vi.stubGlobal('Bun', { env: {} })
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    returning.mockClear()
})

afterEach(() => {
    room?.stop()
    room = undefined
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

function setup(mode: WorldEmptyMode = 'online_ai') {
    let wallTime = 1000
    const world = new GameRoom(undefined, {
        emptyWorldMode: mode,
        worldClock: () => wallTime,
    })
    room = world
    world.start()
    return {
        world,
        step: (ms: number): void => {
            wallTime += ms
            vi.advanceTimersByTime(roomTickMs)
        },
    }
}

it('walks from the last disconnect position and commits to returning at exactly 60 seconds', () => {
    const { world, step } = setup()
    const player = joinScenarioRoom(world, 'Walk for a minute')
    const origin = { ...player.actor.position }
    world.handleClose(player.socket)
    step(50)
    expect(player.actor.connected).toBe(false)
    expect(distance(origin, player.actor.position)).toBeGreaterThan(0)
    step(59_949)
    expect(returning).not.toHaveBeenCalled()
    step(1)
    expect(returning.mock.calls[0]?.[0]).toBe(player.actor)
    expect(returning.mock.calls[0]?.[3]).toBe(61_000)
})

it('remembers seeing an enemy even if the enemy stops being hostile before stun ends', () => {
    const { world, step } = setup()
    const player = joinScenarioRoom(world, 'An injured Echo')
    const enemy = joinScenarioRoom(world, 'A declared enemy')
    enemy.actor.position = { ...player.actor.position }
    setDeclaredHostility(player.actor, enemy.actor, true)
    player.actor.stunUntil = world.gameplayNow() + 500

    world.handleClose(player.socket)
    step(50)
    expect(returning).not.toHaveBeenCalled()
    setDeclaredHostility(player.actor, enemy.actor, false)
    step(450)
    expect(returning.mock.calls[0]?.[0]).toBe(player.actor)
    expect(returning.mock.calls[0]?.[3]).toBe(1500)
})

it('lets the active scenario decide about enemies and starts the minute at its destination', () => {
    const { world, step } = setup()
    const player = joinScenarioRoom(world, 'Finish the road')
    const enemy = joinScenarioRoom(world, 'Scenario threat')
    const origin = { ...player.actor.position }
    const target = nearbyScenarioPoint(world, player.actor)
    player.actor.position = target
    player.send({ type: 'marker_create', name: 'End of the road' })
    const marker = savedScenarioMarker(player)
    player.actor.position = origin
    enemy.actor.position = { ...origin }
    setDeclaredHostility(player.actor, enemy.actor, true)
    player.save(
        roomScenario('finish-road', [
            {
                id: 'go',
                kind: 'go',
                destination: { kind: 'marker', markerId: marker.id },
            },
        ])
    )
    player.send({ type: 'scenario_start', scenarioId: 'finish-road' })
    world.handleClose(player.socket)
    step(50)
    expect(world.scenarios.running(player.actor.id)).toBe(true)
    expect(returning).not.toHaveBeenCalled()
    setDeclaredHostility(player.actor, enemy.actor, false)
    for (
        let tick = 0;
        tick < 80 && world.scenarios.running(player.actor.id);
        tick += 1
    ) {
        step(50)
    }

    expect(player.view().run?.status).toBe('completed')
    expect(returning).not.toHaveBeenCalled()
    const radius = world.navigation.grid.tileWidth * 3
    expect(distance(origin, player.actor.position)).toBeGreaterThan(radius)
    expect(distance(target, player.actor.position)).toBeLessThanOrEqual(radius)
    const finishedAt = world.gameplayNow()
    step(59_999)
    expect(distance(target, player.actor.position)).toBeLessThanOrEqual(radius)
    expect(returning).not.toHaveBeenCalled()
    step(1)
    expect(returning.mock.calls[0]?.[3]).toBe(finishedAt + 60_000)
})

it('freezes the walking timer while the room is empty and paused', () => {
    const { world, step } = setup('paused_when_empty')
    const player = joinScenarioRoom(world, 'Sleep through empty time')
    const origin = { ...player.actor.position }
    world.handleClose(player.socket)
    step(90_000)
    expect(world.gameplayNow()).toBe(1000)
    expect(player.actor.position).toEqual(origin)

    joinScenarioRoom(world, 'Wake the world')
    step(59_999)
    expect(returning).not.toHaveBeenCalled()
    step(1)
    expect(returning.mock.calls[0]?.[0]).toBe(player.actor)
    expect(returning.mock.calls[0]?.[3]).toBe(61_000)
})

it('starts an Echo on a socket identity switch and gives the old player control on rejoin', () => {
    const { world, step } = setup()
    const player = joinScenarioRoom(world, 'First walk')
    const origin = { ...player.actor.position }
    player.send({ type: 'join', nickname: 'New active character' })
    step(50)
    expect(distance(player.actor.position, origin)).toBeGreaterThan(0)
    const current = { ...player.actor.position }
    const resumed = joinScenarioRoom(world, 'First walk')
    expect(resumed.actor).toBe(player.actor)
    expect(resumed.actor.position).toEqual(current)
    expect(resumed.actor.soul.kind).toBe('spark')
    step(60_000)
    expect(resumed.actor.position).toEqual(current)
    expect(returning).not.toHaveBeenCalled()
})
