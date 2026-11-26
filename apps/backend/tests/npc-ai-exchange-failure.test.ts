import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { snapshotCharacterRoute } from '../src/game/characterRoute'
import {
    controlledNpcProvider,
    npcReply,
    npcRuntimeFixture,
} from './npcAiRuntimeFixture'
import { nearbyScenarioPoint } from './scenarioRoomHelpers'

const fixtures: Array<ReturnType<typeof npcRuntimeFixture>> = []
beforeEach(() => {
    vi.stubGlobal('Bun', { env: {} })
    vi.useFakeTimers()
    vi.setSystemTime(1000)
})
afterEach(async () => {
    for (const fixture of fixtures.splice(0)) {
        fixture.room.stop()
        await fixture.diagnostics.flush()
    }
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

async function openExchange() {
    const provider = controlledNpcProvider()
    const f = npcRuntimeFixture(provider.decide, {
        timeoutMs: 1000,
        cityOnly: true,
    })
    fixtures.push(f)
    f.alice.send({ type: 'exchange_invite', targetId: f.actor.id })
    await f.advance()
    const exchangeId = f.room.social.exchanges.snapshot(f.actor.id)?.id ?? ''
    expect(
        provider.turns[0]?.context.observation.social?.exchange?.status
    ).toBe('invited')
    provider.turns[0]?.resolve(
        npcReply(
            { type: 'exchange_answer', exchangeId, accept: true },
            {
                taskAcceptance: 'none',
            }
        )
    )
    await f.advance()
    expect(f.room.social.exchanges.snapshot(f.actor.id)?.status).toBe('active')
    expect(f.actor.soul.kind).toBe('spark')
    expect(f.room.social.exchanges.isPaused(f.actor.id)).toBe(true)
    f.alice.send({
        type: 'whisper',
        targetId: f.actor.id,
        text: 'Обсудим условия обмена?',
    })
    await f.advance()
    return { ...f, provider, exchangeId }
}

it('closes an active exchange after two dialogue timeouts and releases the idle model lease', async () => {
    const f = await openExchange()
    const inventory = structuredClone(f.actor.inventory)
    await f.advance(3000)
    expect(f.provider.turns).toHaveLength(3)
    expect(f.provider.turns.slice(1).every((turn) => turn.signal.aborted)).toBe(
        true
    )
    expect(f.room.social.exchanges.snapshot(f.alice.actor.id)?.status).toBe(
        'cancelled'
    )
    expect(f.room.social.exchanges.isPaused(f.actor.id)).toBe(false)
    expect(f.room.social.exchanges.isPaused(f.alice.actor.id)).toBe(false)
    expect(f.actor.soul.kind).toBe('echo')
    expect(f.actor.soul.controlSource).toBe('script')
    expect(f.actor.inventory).toEqual(inventory)
    await f.diagnostics.flush()
    expect(
        f.entries().some((entry) => entry['category'] === 'provider_error')
    ).toBe(true)
    f.provider.turns[1]?.resolve(
        npcReply({
            type: 'exchange_accept',
            exchangeId: f.exchangeId,
            revision: 1,
        })
    )
    await f.advance()
    expect(f.room.social.exchanges.snapshot(f.alice.actor.id)?.status).toBe(
        'cancelled'
    )
    expect(f.actor.inventory).toEqual(inventory)
})

it('stopping the room closes an active exchange and aborts its outstanding model turn', async () => {
    const f = await openExchange()
    expect(f.provider.turns).toHaveLength(2)
    const inventory = structuredClone(f.actor.inventory)
    f.room.stop()
    expect(f.provider.turns[1]?.signal.aborted).toBe(true)
    expect(f.room.social.exchanges.snapshot(f.actor.id)?.status).toBe(
        'cancelled'
    )
    expect(f.room.social.exchanges.isPaused(f.actor.id)).toBe(false)
    expect(f.actor.soul.kind).toBe('echo')
    f.provider.turns[1]?.resolve(
        npcReply({
            type: 'exchange_accept',
            exchangeId: f.exchangeId,
            revision: 1,
        })
    )
    await f.advance()
    expect(f.actor.inventory).toEqual(inventory)
    expect(f.actor.soul.kind).toBe('echo')
})

it('repeated trade dialogue failures release the exchange while retaining a previously accepted errand', async () => {
    const provider = controlledNpcProvider()
    const f = npcRuntimeFixture(provider.decide, {
        timeoutMs: 1000,
        cityOnly: true,
    })
    fixtures.push(f)
    const target = nearbyScenarioPoint(f.room, f.actor)
    const request = 'Дойди до указанной точки.'
    f.talk(request)
    await f.advance(50)
    provider.turns[0]?.resolve(
        npcReply(
            { type: 'move_to', target },
            {
                taskAcceptance: 'accept',
                done: false,
            }
        )
    )
    await f.advance(50)
    expect(snapshotCharacterRoute(f.actor)?.mode).toBe('route')
    f.alice.send({ type: 'exchange_invite', targetId: f.actor.id })
    await f.advance(50)
    const exchangeId = f.room.social.exchanges.snapshot(f.actor.id)?.id ?? ''
    provider.turns[1]?.resolve(
        npcReply(
            { type: 'exchange_answer', exchangeId, accept: true },
            {
                taskAcceptance: 'none',
            }
        )
    )
    await f.advance(50)
    expect(f.room.social.exchanges.isPaused(f.actor.id)).toBe(true)
    const paused = { ...f.actor.position }
    f.alice.send({
        type: 'whisper',
        targetId: f.actor.id,
        text: 'Обсудим условия обмена?',
    })
    await f.advance(3000)
    expect(f.room.social.exchanges.isPaused(f.actor.id)).toBe(false)
    expect(f.room.social.exchanges.snapshot(f.alice.actor.id)?.status).toBe(
        'cancelled'
    )
    expect(f.actor.soul.kind).toBe('spark')
    expect(f.actor.position).not.toEqual(paused)
    await f.advance(1500)
    expect(f.actor.position).toEqual(target)
    expect(
        provider.turns.some(
            (turn, index) => index > 3 && turn.context.task?.request === request
        )
    ).toBe(true)
    await f.diagnostics.flush()
    expect(f.entries()).toContainEqual(
        expect.objectContaining({
            category: 'action_completed',
            reason: 'arrived',
        })
    )
})
