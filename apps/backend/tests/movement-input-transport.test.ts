import {
    CENTER_LOCATION_ID,
    type ClientMessage,
} from '@my-game-ratata/contracts'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { NavigationService } from '../src/game/navigation'
import { GameRoom } from '../src/game/room'
import { snapshotStream } from '../src/game/snapshotStreamState'
import { joinScenarioRoom } from './scenarioRoomHelpers'
import { required } from './snapshotStreamFixture'

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

function fixture() {
    const room = new GameRoom(
        new NavigationService({
            id: CENTER_LOCATION_ID,
            width: 96,
            height: 80,
            tileWidth: 16,
            tileHeight: 16,
            solid: Array<boolean>(96 * 80).fill(false),
            solidLayerNames: [],
        })
    )
    rooms.push(room)
    room.start()
    const player = joinScenarioRoom(room, 'Timed input')
    player.actor.config.moveSpeed = 100
    return { room, ...player, origin: { ...player.actor.position } }
}

it.each(['move_input', 'release_input'] as const)(
    'uses trusted receipt time for %s and publishes the ended partial step',
    (stop) => {
        const f = fixture()
        vi.advanceTimersByTime(10)
        f.send({ type: 'move_input', axis: { x: 1, y: 0 } })
        vi.advanceTimersByTime(25)
        const command: ClientMessage =
            stop === 'release_input'
                ? { type: 'release_input' }
                : { type: 'move_input', axis: { x: 0, y: 0 } }
        // Client-supplied clocks and positions must not change server receipt timing.
        if (stop === 'release_input') {
            f.send(command)
        } else {
            f.room.handleMessage(
                f.socket,
                JSON.stringify({
                    ...command,
                    receivedAt: 1000,
                    stoppedAt: 1500,
                    position: { x: 9999, y: 9999 },
                })
            )
        }
        vi.advanceTimersByTime(15)
        expect(f.actor.position.x - f.origin.x).toBeCloseTo(2.5, 9)
        expect(f.actor.position.y).toBe(f.origin.y)
        const frame = required(snapshotStream(f.socket).baseline)
        const self = required(
            frame.characters.find((actor) => actor.id === f.actor.id)
        )
        expect(frame.stepMs).toBe(50)
        expect(self.velocity).toEqual({ x: 2.5, y: 0 })
        expect(self.movement?.continuationUntil).toBe(1035)
        vi.advanceTimersByTime(100)
        expect(f.actor.position.x - f.origin.x).toBeCloseTo(2.5, 9)
        const stopped = required(
            required(snapshotStream(f.socket).baseline).characters.find(
                (actor) => actor.id === f.actor.id
            )
        )
        expect(stopped.velocity).toEqual({ x: 0, y: 0 })
        expect(stopped.movement).not.toHaveProperty('continuationUntil')
    }
)

it('keeps successive starts, stops and reversals inside one real server step', () => {
    const f = fixture()
    vi.advanceTimersByTime(10)
    f.send({ type: 'move_input', axis: { x: 1, y: 0 } })
    vi.advanceTimersByTime(10)
    f.send({ type: 'move_input', axis: { x: 0, y: 0 } })
    vi.advanceTimersByTime(10)
    f.send({ type: 'move_input', axis: { x: -1, y: 0 } })
    vi.advanceTimersByTime(10)
    f.send({ type: 'release_input' })
    vi.advanceTimersByTime(10)
    expect(f.actor.position.x).toBeCloseTo(f.origin.x, 9)
    expect(f.actor.getMoveInput()).toEqual({ x: 0, y: 0 })
    vi.advanceTimersByTime(50)
    expect(f.actor.position.x).toBeCloseTo(f.origin.x, 9)
})

it('discards pending manual credit on disconnect before the next step', () => {
    const f = fixture()
    vi.advanceTimersByTime(10)
    f.send({ type: 'move_input', axis: { x: 1, y: 0 } })
    vi.advanceTimersByTime(15)
    f.room.handleClose(f.socket)
    vi.advanceTimersByTime(25)
    expect(f.actor.position).toEqual(f.origin)
    expect(f.actor.getMoveInput()).toEqual({ x: 0, y: 0 })
})
