import { afterEach, expect, it, vi } from 'vitest'

import { snapshotControl } from '../src/game/characterControl'
import { GameRoom } from '../src/game/room'

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

it('expires a model follow lease even while the automatic controller owns every simulation tick', () => {
    vi.stubGlobal('Bun', { env: {} })
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    const room = new GameRoom()
    const veteran = room.getCharacter('npc_veteran_1')
    const princess = room.getCharacter('npc_princess_1')
    if (veteran === undefined || princess === undefined) {
        throw new Error('Missing authored NPCs')
    }
    const result = room.decideForAgent(veteran.id, {
        type: 'follow',
        targetId: princess.id,
    })
    expect(result.accepted).toBe(true)
    room.start()
    vi.advanceTimersByTime(4950)
    expect(snapshotControl(veteran).mode).toBe('follow')
    expect(veteran.soul.controlSource).toBe('model')
    expect(veteran.soul.kind).toBe('spark')
    vi.advanceTimersByTime(50)
    expect(snapshotControl(veteran).mode).toBe('none')
    expect(veteran.soul.controlSource).toBe('script')
    expect(veteran.soul.kind).toBe('echo')
    room.stop()
})
