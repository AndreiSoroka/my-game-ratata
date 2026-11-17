import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { snapshotCharacterRoute } from '../src/game/characterRoute'
import { npcReply, npcRuntimeFixture } from './npcAiRuntimeFixture'
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
