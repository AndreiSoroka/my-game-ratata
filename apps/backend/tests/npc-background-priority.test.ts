import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { memoryForCharacter } from '../src/ai/characterMinds'
import {
    controlledNpcProvider,
    kaplyaId,
    miraId,
    npcReply,
    npcRuntimeFixture,
} from './npcAiRuntimeFixture'

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

it('preempts another NPC background model call for a real player request', async () => {
    const provider = controlledNpcProvider()
    const f = npcRuntimeFixture(provider.decide, { includeMira: true })
    fixture = f
    const memory = memoryForCharacter(f.actor)
    memory.observe(
        f.alice.actor.id,
        f.alice.actor.nickname,
        f.alice.actor.position,
        f.actor.locationId,
        Date.now()
    )
    memory.recordConversation(f.alice.actor.id, Date.now())
    await f.advance()
    expect(provider.turns[0]?.context.actorId).toBe(miraId)
    expect(provider.turns[0]?.context.task?.requesterId).toBeNull()
    f.talk('Привет, Капля.')
    await f.advance()
    expect(provider.turns[0]?.signal.aborted).toBe(true)
    expect(provider.turns[1]?.context.actorId).toBe(kaplyaId)
    provider.turns[1]?.resolve(
        npcReply(null, { speech: 'Привет!', taskAcceptance: 'none' })
    )
    await f.advance()
    expect(f.speech().filter((event) => event.text === 'Привет!')).toHaveLength(
        1
    )
    provider.turns[0]?.resolve(
        npcReply(null, { speech: 'Поздний городской обзор.' })
    )
    await f.advance()
    expect(
        f.alice.sent.some(
            (message) =>
                message.type === 'event' &&
                message.event.text === 'Поздний городской обзор.'
        )
    ).toBe(false)
})
