import { afterEach, describe, expect, it, vi } from 'vitest'

import { characterFixture, worldFixture } from './characterFixture'
import { installTestInterface, type RatataTestApi, type RatataTestState } from './testInterface'

const installed: ReturnType<typeof installTestInterface>[] = []

afterEach(() => {
    for (const entry of installed.splice(0)) entry.dispose()
    vi.useRealTimers()
})

function setup(connected = true) {
    const player = characterFixture('self')
    const state: RatataTestState = {
        connected,
        defeated: false,
        error: '',
        inventoryOpen: false,
        localPlayerId: player.id,
        location: undefined,
        notice: '',
        player,
        snapshot: worldFixture([player]),
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

    it('releases timed movement even when a replacement navigation request is invalid', async () => {
        vi.useFakeTimers()
        const { api, send } = setup()
        const moving = api.moveFor({ x: 1, y: 0 }, 1000)
        expect(() => api.navigate({ x: Infinity, y: 0 })).toThrow('finite point')
        await moving
        expect(send).toHaveBeenLastCalledWith({ type: 'move_input', axis: { x: 0, y: 0 } })
        expect(vi.getTimerCount()).toBe(0)
    })

    it('validates waiting before sending an action and stops pending waits on blur', async () => {
        vi.useFakeTimers()
        const { api, send } = setup()
        expect(() => api.act({ type: 'attack' }, { timeoutMs: Infinity })).toThrow('Timeout')
        expect(send).not.toHaveBeenCalled()
        const waiting = api.waitFor({ type: 'quest', status: 'completed' })
        window.dispatchEvent(new Event('blur'))
        expect((await waiting).status).toBe('cancelled')
        expect(vi.getTimerCount()).toBe(0)
    })

    it('checks action outcomes only after a fresh snapshot even when the condition already matches', async () => {
        vi.useFakeTimers()
        const { api, state } = setup()
        const result = api.act(
            { type: 'move_to', target: { x: 100, y: 100 } },
            {
                until: { type: 'idle' },
                timeoutMs: 100,
            }
        )
        await vi.advanceTimersByTimeAsync(100)
        expect((await result).status).toBe('timeout')
        const next = api.act({ type: 'attack' }, { until: { type: 'idle' } })
        state.snapshot!.tick += 1
        await vi.advanceTimersByTimeAsync(50)
        expect((await next).status).toBe('condition_met')
    })

    it('keeps an observation wait active when a timed movement ends normally', async () => {
        vi.useFakeTimers()
        const { api, state } = setup()
        const movement = api.moveFor({ x: 1, y: 0 }, 100)
        const observed = api.waitFor({ type: 'tick', after: state.snapshot!.tick })
        await vi.advanceTimersByTimeAsync(100)
        await movement
        state.snapshot!.tick += 1
        await vi.advanceTimersByTimeAsync(50)
        expect((await observed).status).toBe('condition_met')
    })

    it('revokes stale handles after disposal and rejects invalid movement before sending', async () => {
        const { api, dispose, send } = setup()
        await expect(api.moveFor({ x: NaN, y: 0 }, 100)).rejects.toThrow('axis')
        expect(send).not.toHaveBeenCalled()
        dispose()
        send.mockClear()
        expect(() => api.send({ type: 'attack' })).toThrow('disposed')
        expect(() => api.navigate({ x: 1, y: 1 })).toThrow('disposed')
        expect(send).not.toHaveBeenCalled()
    })
})

describe('joining before asynchronous presentation is ready', () => {
    it('waits for the first map after the server session has been established', async () => {
        vi.useFakeTimers()
        const { api, state } = setup(false)
        state.mapReady = false
        const completed = vi.fn<() => void>()
        const joining = api.join('self')
        void joining.then(completed)
        await vi.advanceTimersByTimeAsync(500)
        expect(state.connected).toBe(true)
        expect(completed).not.toHaveBeenCalled()
        state.mapReady = true
        await vi.advanceTimersByTimeAsync(50)
        await joining
        expect(completed).toHaveBeenCalledOnce()
    })
})
