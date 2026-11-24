import type { ServerMessage } from '@my-game-ratata/contracts'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { parseClientMessage } from '../src/game/messages'
import { GameRoom } from '../src/game/room'
import type { RoomSocket } from '../src/game/roomMessaging'
import { snapshotStream } from '../src/game/snapshotStreamState'
import { joinScenarioRoom } from './scenarioRoomHelpers'

const rooms: GameRoom[] = []
beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    vi.stubGlobal('Bun', { env: {} })
})
afterEach(() => {
    for (const room of rooms.splice(0)) {
        room.stop()
    }
    vi.useRealTimers()
    vi.unstubAllGlobals()
})
function roomFixture() {
    const room = new GameRoom(undefined, {
        emptyWorldMode: 'paused_when_empty',
    })
    rooms.push(room)
    room.start()
    return room
}

it('strips fabricated resync ownership and requires a joined socket', () => {
    expect(
        parseClientMessage(
            JSON.stringify({
                type: 'snapshot_resync',
                playerId: 'foreign',
                seq: 500,
            })
        )
    ).toEqual({ message: { type: 'snapshot_resync' } })
    const room = roomFixture()
    const frames: ServerMessage[] = []
    const socket = {
        send: (payload: string) =>
            frames.push(JSON.parse(payload) as ServerMessage),
    } as RoomSocket
    room.handleOpen(socket)
    room.handleMessage(socket, JSON.stringify({ type: 'snapshot_resync' }))
    expect(frames.at(-1)).toMatchObject({ type: 'error', code: 'not_joined' })
    expect(snapshotStream(socket).pendingResync).toBe(false)
})

it('schedules fresh resync on the next normal tick even while a joined actor is dead', () => {
    const room = roomFixture()
    const player = joinScenarioRoom(room, 'Resync observer')
    const streamId = snapshotStream(player.socket).streamId
    player.actor.alive = false
    const count = player.sent.length
    player.send({ type: 'snapshot_resync' })
    expect(player.sent).toHaveLength(count)
    expect(snapshotStream(player.socket).pendingResync).toBe(true)
    vi.advanceTimersByTime(50)
    const full = player.sent
        .filter((message) => message.type === 'snapshot')
        .at(-1)
    expect(full).toMatchObject({
        type: 'snapshot',
        streamId,
        seq: 1,
        snapshot: { stepMs: 50, serverTime: 1050 },
    })
    expect(
        full?.snapshot.characters.find(
            (character) => character.id === player.actor.id
        )?.alive
    ).toBe(false)
    expect(snapshotStream(player.socket).pendingResync).toBe(false)
})

it('resets stream after an actual empty-world pause/resume without advancing logical pause time', () => {
    const room = roomFixture()
    const player = joinScenarioRoom(room, 'Paused stream')
    vi.advanceTimersByTime(50)
    const beforeRevision = snapshotStream(player.socket).scope
        ?.clockResumeRevision
    const before = room.gameplayNow()
    room.handleClose(player.socket)
    vi.advanceTimersByTime(5000)
    expect(room.gameplayNow()).toBe(before)
    room.handleOpen(player.socket)
    room.handleMessage(
        player.socket,
        JSON.stringify({ type: 'join', nickname: 'Paused stream' })
    )
    const after = snapshotStream(player.socket)
    expect(beforeRevision).toBe(1)
    expect(after.scope?.clockResumeRevision).toBe(2)
    expect(after.baseline?.serverTime).toBe(before)
    expect(after.baseline?.stepMs).toBe(0)
    vi.advanceTimersByTime(50)
    expect(snapshotStream(player.socket).baseline?.serverTime).toBe(before + 50)
    expect(snapshotStream(player.socket).baseline?.stepMs).toBe(50)
})
