import {
    CENTER_LOCATION_ID,
    type StopCorrectionRequest,
    type Vector2,
} from '@my-game-ratata/contracts'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { restoreCharacter } from '../src/game/characterRecovery'
import { NavigationService } from '../src/game/navigation'
import { GameRoom } from '../src/game/room'
import { snapshotStream } from '../src/game/snapshotStreamState'
import { closestStopPosition } from '../src/game/stopCorrectionGeometry'
import { joinScenarioRoom } from './scenarioRoomHelpers'

type Player = ReturnType<typeof joinScenarioRoom>

const right = { x: 1, y: 0 }
const still = { x: 0, y: 0 }
const rooms: GameRoom[] = []

beforeEach(() => {
    vi.stubGlobal('Bun', { env: {} })
    vi.useFakeTimers()
    vi.setSystemTime(1000)
})

afterEach(() => {
    for (const room of rooms.splice(0)) {
        room.stop()
    }
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

function navigation(blocks: Vector2[] = []) {
    const width = 96
    const height = 80
    const solid = Array<boolean>(width * height).fill(false)
    for (const tile of blocks) {
        solid[tile.y * width + tile.x] = true
    }
    return new NavigationService({
        id: CENTER_LOCATION_ID,
        width,
        height,
        tileWidth: 16,
        tileHeight: 16,
        solid,
        solidLayerNames: [],
    })
}

function fixture(nav = navigation(), position = { x: 100, y: 100 }) {
    const room = new GameRoom(nav, { emptyWorldMode: 'paused_when_empty' })
    rooms.push(room)
    room.start()
    const player = joinScenarioRoom(room, 'Stop correction')
    player.actor.position = position
    player.actor.config.moveSpeed = 100
    return { room, player }
}

function move(player: Player, axis = right) {
    player.send({ type: 'move_input', axis })
}

function advance() {
    vi.advanceTimersByTime(50)
}

function proposal(
    player: Player,
    id: number,
    x: number
): StopCorrectionRequest {
    const { streamId, seq } = snapshotStream(player.socket)
    return { id, streamId, seq, position: { x, y: player.actor.position.y } }
}

function stop(player: Player, stopCorrection: StopCorrectionRequest) {
    player.send({ type: 'move_input', axis: still, stopCorrection })
}

function receipt(player: Player) {
    return snapshotStream(player.socket).baseline?.stopCorrection
}

it('projects the two requested examples onto authorized forward and reverse paths', () => {
    const nav = navigation()
    const forward = closestStopPosition(
        { x: 10, y: 16 },
        { x: 13, y: 16 },
        4,
        { axis: right, remaining: 2 },
        [],
        nav
    )
    expect(forward).toEqual({ position: { x: 12, y: 16 }, cost: 2 })

    const reverse = closestStopPosition(
        { x: 13, y: 16 },
        { x: 12, y: 16 },
        4,
        undefined,
        [{ from: { x: 10, y: 16 }, to: { x: 13, y: 16 }, at: 0 }],
        nav
    )
    expect(reverse).toEqual({ position: { x: 12, y: 16 }, cost: 1 })
})

it('honors wall and corner geometry, including a short traversal through a blocked tile', () => {
    const nav = navigation([{ x: 2, y: 1 }])
    const origin = { x: 31.9, y: 31.8 }
    const requested = { x: 32.9, y: 32.8 }
    const axis = { x: Math.SQRT1_2, y: Math.SQRT1_2 }
    const result = closestStopPosition(
        origin,
        requested,
        4,
        { axis, remaining: 4 },
        [],
        nav
    )
    expect(result.position.x).toBeLessThan(32)
    expect(result.position.x).toBeCloseTo(32, 5)
    expect(result.position.y).toBeCloseTo(31.9, 5)
})

it('spends the full rewound path through a corner', () => {
    const corner = { x: 32, y: 32 }
    const origin = { x: 32, y: 35 }
    const result = closestStopPosition(
        origin,
        { x: 29, y: 32 },
        4,
        undefined,
        [
            { from: { x: 28, y: 32 }, to: corner, at: 0 },
            { from: corner, to: origin, at: 1 },
        ],
        navigation()
    )
    expect(result).toEqual({ position: { x: 31, y: 32 }, cost: 4 })
})

it('clamps forward movement to remaining ordinary path and stays outside a wall', () => {
    const f = fixture(navigation([{ x: 2, y: 6 }]), { x: 23, y: 100 })
    const { player } = f
    move(player)
    advance()
    expect(player.actor.position.x).toBe(28)
    vi.advanceTimersByTime(49)
    stop(player, proposal(player, 1, 34))
    vi.advanceTimersByTime(1)
    expect(player.actor.position.x).toBeLessThan(32)
    expect(player.actor.position.x).toBeCloseTo(32, 5)
    expect(receipt(player)).toEqual({ id: 1, status: 'clamped' })
})

it('caps a return at 4 map pixels, replays without displacement and exhausts one shared reserve', () => {
    const { player } = fixture()
    move(player)
    advance()
    const first = proposal(player, 1, 95)
    stop(player, first)
    advance()
    expect(player.actor.position.x).toBe(101)
    expect(receipt(player)).toEqual({ id: 1, status: 'clamped' })

    move(player)
    stop(player, first)
    advance()
    expect(player.actor.getMoveInput()).toEqual(right)
    expect(player.actor.position.x).toBe(106)
    expect(receipt(player)).toEqual({ id: 1, status: 'clamped' })

    stop(player, proposal(player, 2, 105))
    advance()
    expect(player.actor.position.x).toBe(106)
    expect(receipt(player)).toEqual({ id: 2, status: 'clamped' })
})

it('accounts time from rapid starts and stops without creating new reserve', () => {
    const { player } = fixture()
    for (let id = 1; id <= 6; id++) {
        move(player)
        advance()
        stop(player, proposal(player, id, player.actor.position.x - 1))
        advance()
        expect(receipt(player)).toEqual({
            id,
            status: id <= 4 ? 'accepted' : 'clamped',
        })
    }
    expect(player.actor.position.x).toBe(126)
})

it('leaves ordinary movement intact while cancelling a pending correction on a restart', () => {
    const { player } = fixture()
    move(player)
    advance()
    const pending = proposal(player, 1, 104)
    stop(player, pending)
    vi.advanceTimersByTime(10)
    move(player)
    vi.advanceTimersByTime(40)
    expect(player.actor.position.x).toBe(109)
    expect(receipt(player)).toEqual({ id: 1, status: 'rejected' })
})

it.each([
    'old revision',
    'bad position',
    'resync',
    'new episode',
    'interaction',
] as const)(
    'really stops while rejecting a correction with %s',
    (kind) => {
        const { room, player } = fixture()
        move(player)
        advance()
        const old = proposal(player, 1, 104)
        if (kind === 'old revision') {
            vi.advanceTimersByTime(350)
        } else if (kind === 'new episode') {
            player.send({ type: 'move_input', axis: still })
            advance()
            move(player)
            advance()
        }
        const before = player.actor.position.x
        if (kind === 'bad position') {
            room.handleMessage(
                player.socket,
                JSON.stringify({
                    type: 'move_input',
                    axis: still,
                    stopCorrection: { ...old, position: null },
                })
            )
        } else {
            stop(player, old)
        }
        if (kind === 'resync') {
            player.send({ type: 'snapshot_resync' })
        } else if (kind === 'interaction') {
            player.send({ type: 'pickup_item', worldItemId: 'missing' })
        }
        advance()
        expect(player.actor.position.x).toBe(before)
        expect(player.actor.getMoveInput()).toEqual(still)
        expect(receipt(player)).toEqual({ id: 1, status: 'rejected' })
    },
    15_000
)

it('preserves spent reserve through paused time, reconnect and resurrection', () => {
    const { room, player } = fixture()
    move(player)
    advance()
    const old = proposal(player, 1, 101)
    stop(player, old)
    advance()
    expect(receipt(player)).toEqual({ id: 1, status: 'accepted' })
    room.handleClose(player.socket)
    vi.advanceTimersByTime(1_000)
    const resumed = joinScenarioRoom(room, 'Stop correction')
    expect(resumed.actor).toBe(player.actor)

    move(resumed)
    advance()
    stop(resumed, old)
    advance()
    expect(receipt(resumed)).toEqual({ id: 1, status: 'rejected' })
    restoreCharacter(resumed.actor, room.gameplayNow(), false)
    move(resumed)
    advance()
    const before = resumed.actor.position.x
    stop(resumed, proposal(resumed, 2, before - 1))
    advance()
    expect(resumed.actor.position.x).toBe(before)
    expect(receipt(resumed)).toEqual({ id: 2, status: 'clamped' })
})

it('can rewind a continuous manual turn even when movement keys cancel automatic control', () => {
    const { player } = fixture()
    move(player)
    advance()
    const beforeTurn = proposal(player, 1, 104)
    player.send({
        type: 'set_viewport',
        locationId: CENTER_LOCATION_ID,
        bounds: { left: 0, top: 0, right: 200, bottom: 200 },
    })
    player.send({ type: 'cancel_control' })
    player.send({ type: 'movement_mode', mode: 'walking' })
    move(player, { x: 0, y: 1 })
    vi.advanceTimersByTime(25)
    stop(player, beforeTurn)
    vi.advanceTimersByTime(25)
    expect(player.actor.position).toEqual({ x: 104, y: 100 })
    expect(receipt(player)).toEqual({ id: 1, status: 'accepted' })
})
