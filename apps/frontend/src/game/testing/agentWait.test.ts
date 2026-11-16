import { afterEach, describe, expect, it, vi } from 'vitest'

import { observeGame } from './agentObservation'
import { createAgentWaiter } from './agentWait'
import { adventureFixture, characterFixture, worldFixture } from './characterFixture'
import type { RatataTestState } from './testInterface'

afterEach(() => vi.useRealTimers())

function setup() {
    vi.useFakeTimers()
    const player = characterFixture('self')
    const snapshot = worldFixture([player])
    snapshot.adventure = adventureFixture()
    const state: RatataTestState = {
        connected: true,
        defeated: false,
        error: '',
        inventoryOpen: false,
        localPlayerId: player.id,
        location: undefined,
        notice: '',
        player,
        snapshot,
        status: 'Connected',
    }
    const waiter = createAgentWaiter({ getState: () => state, observe: () => observeGame(state) })
    return { state, snapshot, player, waiter }
}

describe('AI outcome observation', () => {
    it('requires the actual quest state, not merely a new snapshot', async () => {
        const { waiter, snapshot } = setup()
        const result = waiter.waitFor({ type: 'quest', status: 'active' }, { timeoutMs: 200 })
        snapshot.tick += 1
        await vi.advanceTimersByTimeAsync(200)
        expect((await result).status).toBe('timeout')
    })

    it('recognizes real outcomes and returns a detached observation', async () => {
        const { waiter, snapshot } = setup()
        const result = waiter.waitFor({ type: 'quest', status: 'active' })
        snapshot.adventure!.quest.status = 'active'
        await vi.advanceTimersByTimeAsync(50)
        const observed = await result
        expect(observed.status).toBe('condition_met')
        observed.observation.adventure!.quest.status = 'completed'
        expect(snapshot.adventure!.quest.status).toBe('active')
    })

    it('counts quantities in the actual bag and notices only new receipt identities', async () => {
        const { waiter, player, snapshot } = setup()
        player.inventory = [{ instanceId: 'grain', itemId: 'grain', quantity: 3 }]
        expect(
            (await waiter.waitFor({ type: 'inventory', itemId: 'grain', atLeast: 3 })).status
        ).toBe('condition_met')
        snapshot.adventure!.noticeId = 7
        snapshot.adventure!.notice = 'Same text'
        const receipt = waiter.waitFor({ type: 'notice', after: 7 }, { timeoutMs: 100 })
        await vi.advanceTimersByTimeAsync(50)
        snapshot.adventure!.noticeId = 8
        await vi.advanceTimersByTimeAsync(50)
        expect((await receipt).status).toBe('condition_met')
    })

    it('distinguishes a later snapshot from command acceptance', async () => {
        const { waiter, snapshot } = setup()
        const result = waiter.waitFor({ type: 'tick', after: snapshot.tick }, {}, 'updated')
        snapshot.tick += 1
        await vi.advanceTimersByTimeAsync(50)
        expect((await result).status).toBe('updated')
        expect((await result).reason).toContain('does not acknowledge')
    })

    it.each(['disconnect', 'identity', 'retirement', 'death', 'offline'] as const)(
        'ends on %s instead of matching stale data',
        async (cause) => {
            const { waiter, state, snapshot } = setup()
            const result = waiter.waitFor({ type: 'quest', status: 'active' })
            if (cause === 'disconnect') state.connected = false
            if (cause === 'identity') state.localPlayerId = 'new-identity'
            if (cause === 'retirement') state.defeated = true
            if (cause === 'death') state.player!.alive = false
            if (cause === 'offline') state.player!.tags = ['offline']
            snapshot.adventure!.quest.status = 'active'
            await vi.advanceTimersByTimeAsync(50)
            expect((await result).status).toBe('unavailable')
            expect(vi.getTimerCount()).toBe(0)
        }
    )

    it('cancels all outstanding polls and prevents waits after disposal', async () => {
        const { waiter } = setup()
        const result = waiter.waitFor({ type: 'quest', status: 'completed' })
        waiter.dispose()
        expect((await result).status).toBe('cancelled')
        expect((await waiter.waitFor({ type: 'idle' })).status).toBe('cancelled')
        expect(vi.getTimerCount()).toBe(0)
    })

    it('rejects unbounded or malformed requests before scheduling', () => {
        const { waiter } = setup()
        expect(() => waiter.waitFor({ type: 'idle' }, { timeoutMs: Infinity })).toThrow('Timeout')
        expect(() => waiter.waitFor({ type: 'inventory', itemId: 'grain', atLeast: -1 })).toThrow(
            'Invalid'
        )
        expect(vi.getTimerCount()).toBe(0)
    })
})
