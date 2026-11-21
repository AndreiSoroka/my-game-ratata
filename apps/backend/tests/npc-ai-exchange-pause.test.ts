import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { snapshotCharacterRoute } from '../src/game/characterRoute'
import {
    controlledNpcProvider,
    npcReply,
    npcRuntimeFixture,
} from './npcAiRuntimeFixture'
import { nearbyScenarioPoint } from './scenarioRoomHelpers'

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

it('retains the same AI route and arrival receipt across a long consensual exchange pause', async () => {
    let first = true
    const f = npcRuntimeFixture((context) => {
        if (first) {
            first = false
            return Promise.resolve(
                npcReply(
                    { type: 'move_to', target },
                    {
                        taskAcceptance: 'accept',
                        done: false,
                    }
                )
            )
        }
        const exchange = context.observation.social?.exchange
        return Promise.resolve(
            exchange?.status === 'invited'
                ? npcReply(
                      {
                          type: 'exchange_answer',
                          exchangeId: exchange.id,
                          accept: true,
                      },
                      {
                          taskAcceptance: 'none',
                      }
                  )
                : npcReply(null, { taskAcceptance: 'none' })
        )
    })
    fixture = f
    const target = nearbyScenarioPoint(f.room, f.actor)
    f.talk('Сходи к указанной точке и вернись с ответом.')
    await f.advance(50)
    expect(snapshotCharacterRoute(f.actor)?.mode).toBe('route')
    f.alice.send({ type: 'exchange_invite', targetId: f.actor.id })
    await f.advance(150)
    const exchange = f.room.social.exchanges.snapshot(f.actor.id)
    expect(exchange?.status).toBe('active')
    expect(f.room.social.exchanges.isPaused(f.actor.id)).toBe(true)
    const position = { ...f.actor.position }
    await f.advance(15_000)
    expect(f.actor.position).toEqual(position)
    expect(snapshotCharacterRoute(f.actor)?.mode).toBe('route')
    f.alice.send({ type: 'exchange_cancel', exchangeId: exchange?.id ?? '' })
    await f.advance(3_000)
    expect(f.actor.position).not.toEqual(position)
    expect(f.actor.position).toEqual(target)
    await f.diagnostics.flush()
    expect(f.entries()).toContainEqual(
        expect.objectContaining({
            category: 'action_completed',
            reason: 'arrived',
        })
    )
}, 15_000)

it('delivers an NPC invitation to the player and wakes the NPC on acceptance', async () => {
    const provider = controlledNpcProvider()
    const f = npcRuntimeFixture(provider.decide)
    fixture = f
    f.alice.send({
        type: 'whisper',
        targetId: f.actor.id,
        text: 'Есть что обменять?',
    })
    await f.advance()
    expect(provider.turns).toHaveLength(1)
    provider.turns[0]?.resolve(
        npcReply({ type: 'exchange_invite', targetId: f.alice.actor.id })
    )
    await f.advance()

    const playerExchange = () =>
        f.alice.sent.findLast((message) => message.type === 'snapshot')
            ?.snapshot.social?.exchange
    const invitation = playerExchange()
    expect(invitation).toMatchObject({
        status: 'invited',
        incoming: true,
        partnerId: f.actor.id,
        partnerName: f.actor.nickname,
    })
    expect(f.room.social.exchanges.isPaused(f.alice.actor.id)).toBe(false)
    expect(provider.turns).toHaveLength(1)

    const exchangeId = invitation?.id ?? ''
    f.alice.send({ type: 'exchange_answer', exchangeId, accept: true })
    f.alice.send({ type: 'exchange_answer', exchangeId, accept: true })
    await f.advance()
    expect(playerExchange()).toMatchObject({ id: exchangeId, status: 'active' })
    expect(provider.turns).toHaveLength(2)
    expect(
        provider.turns[1]?.context.observation.social?.exchange
    ).toMatchObject({
        id: exchangeId,
        status: 'active',
        incoming: false,
        partnerId: f.alice.actor.id,
    })
    provider.turns[1]?.resolve(npcReply())
    await f.advance()
    expect(provider.turns).toHaveLength(2)
}, 15_000)
