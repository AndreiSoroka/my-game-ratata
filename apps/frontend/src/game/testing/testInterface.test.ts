import { afterEach, describe, expect, it, vi } from 'vitest'

import { installTestInterface, type RatataTestApi, type RatataTestState } from './testInterface'

const installed: ReturnType<typeof installTestInterface>[] = []

afterEach(() => {
    for (const entry of installed.splice(0)) entry.dispose()
    vi.useRealTimers()
})

function setup(connected = true) {
    const state: RatataTestState = {
        connected,
        defeated: false,
        error: '',
        inventoryOpen: false,
        localPlayerId: undefined,
        location: undefined,
        notice: '',
        player: undefined,
        snapshot: undefined,
        status: connected ? 'Connected' : 'Ready',
    }
    const send = vi.fn<RatataTestApi['send']>()
    const entry = installTestInterface({
        getState: () => state,
        inventory: vi.fn<RatataTestApi['inventory']>(),
        join: vi.fn<RatataTestApi['join']>(async () => {
            state.connected = true
        }),
        send,
    })
    installed.push(entry)
    return { ...entry, send, state }
}

describe('test controls', () => {
    it('rejects commands before joining and exposes a detached read snapshot', () => {
        const { api, send, state } = setup(false)
        expect(() => api.send({ type: 'attack' })).toThrow('Join the game')
        expect(send).not.toHaveBeenCalled()
        api.getState().connected = true
        expect(state.connected).toBe(false)
    })

    it('uses normal movement commands and releases movement after the requested duration', async () => {
        vi.useFakeTimers()
        const { api, send } = setup()
        const completed = api.moveFor({ x: 1, y: 0 }, 500)
        expect(send).toHaveBeenLastCalledWith({ axis: { x: 1, y: 0 }, type: 'move_input' })
        vi.advanceTimersByTime(499)
        expect(send).toHaveBeenLastCalledWith({ axis: { x: 1, y: 0 }, type: 'move_input' })
        vi.advanceTimersByTime(1)
        await completed
        expect(send).toHaveBeenLastCalledWith({ axis: { x: 0, y: 0 }, type: 'move_input' })
    })

    it('preserves a requested gait when starting a timed movement', async () => {
        vi.useFakeTimers()
        const { api, send } = setup()
        api.send({ type: 'movement_mode', mode: 'walking' })
        const completed = api.moveFor({ x: 1, y: 0 }, 100)
        expect(send.mock.calls).toEqual([
            [{ type: 'movement_mode', mode: 'walking' }],
            [{ type: 'move_input', axis: { x: 1, y: 0 } }],
        ])
        vi.advanceTimersByTime(100)
        await completed
    })
    it('cancels an old movement timer when a new path command takes over', async () => {
        vi.useFakeTimers()
        const { api, send } = setup()
        const completed = api.moveFor({ x: 1, y: 0 }, 500)
        api.send({ target: { x: 120, y: 80 }, type: 'move_to' })
        await completed
        send.mockClear()
        vi.advanceTimersByTime(1000)
        expect(send).not.toHaveBeenCalled()
    })

    it('releases held input on blur and removes its global interface on disposal', async () => {
        vi.useFakeTimers()
        const { api, dispose, send } = setup()
        const completed = api.moveFor({ x: 0, y: -1 }, 500)
        window.dispatchEvent(new Event('blur'))
        await completed
        expect(send).toHaveBeenLastCalledWith({ axis: { x: 0, y: 0 }, type: 'move_input' })
        expect(window.__ratataTest).toBe(api)
        dispose()
        expect(window.__ratataTest).toBeUndefined()
    })
})
