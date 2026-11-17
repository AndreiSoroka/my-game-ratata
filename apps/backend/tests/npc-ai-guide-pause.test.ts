import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { npcActionPaused } from '../src/ai/actionPause'
import { parseNpcAiConfig } from '../src/ai/config'
import { reconcileNpcGuide } from '../src/ai/guide'
import { createNpcAiState } from '../src/ai/runtimeState'
import { CompanionService } from '../src/game/companions'
import { npcReply, npcRuntimeFixture } from './npcAiRuntimeFixture'

let fixture: ReturnType<typeof npcRuntimeFixture> | undefined
beforeEach(() => {
    vi.stubGlobal('Bun', { env: {} })
    vi.useFakeTimers()
    vi.setSystemTime(1000)
})
afterEach(async () => {
    fixture?.room.stop()
    await fixture?.diagnostics.flush()
    fixture = undefined
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

it('excludes a long exchange from an already waiting guide’s lost-requester timer', async () => {
    const f = npcRuntimeFixture((context) => {
        const exchange = context.observation.social?.exchange
        return Promise.resolve(
            exchange?.status === 'invited'
                ? npcReply(
                      {
                          type: 'exchange_answer',
                          exchangeId: exchange.id,
                          accept: true,
                      },
                      { taskAcceptance: 'none' }
                  )
                : npcReply()
        )
    })
    fixture = f
    f.alice.send({ type: 'exchange_invite', targetId: f.actor.id })
    await f.advance()
    const exchange = f.room.social.exchanges.snapshot(f.actor.id)
    expect(exchange?.status).toBe('active')
    const config = parseNpcAiConfig(
        { npcs: [{ actorId: f.actor.id, role: 'companion' }] },
        true
    ).npcs[0]
    if (config === undefined || exchange === null) {
        throw new Error('Missing guide fixture')
    }
    const state = createNpcAiState(config, f.actor)
    state.task = {
        id: 'guide-request',
        requesterId: f.alice.actor.id,
        request: 'Покажи гильдию.',
        steps: 1,
    }
    state.guide = {
        id: 'guide-action',
        decision: { type: 'guide', targetKey: 'building:guild' },
        locationId: f.actor.locationId,
        destination: { ...f.actor.position },
        waitingSince: 1000,
        deadline: 181_000,
    }
    expect(npcActionPaused(state, f.actor.id, 2000, f.room)).toBe(true)
    f.alice.send({ type: 'exchange_cancel', exchangeId: exchange.id })
    expect(npcActionPaused(state, f.actor.id, 63_000, f.room)).toBe(false)
    expect(state.guide.waitingSince).toBe(62_000)
    expect(state.guide.deadline).toBe(242_000)
    // This domain fixture keeps the requester outside hearing after the trade.
    f.alice.actor.position = {
        x: f.actor.position.x + 100,
        y: f.actor.position.y,
    }
    const companions = new CompanionService()
    expect(reconcileNpcGuide(f.room, companions, state, 63_000)).toBeUndefined()
    expect(
        reconcileNpcGuide(f.room, companions, state, 121_999)
    ).toBeUndefined()
    expect(reconcileNpcGuide(f.room, companions, state, 122_000)).toMatchObject(
        {
            status: 'failed',
            reason: 'Собеседник не вернулся к проводнику.',
        }
    )
})
