import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import {
    controlledNpcProvider,
    kaplyaId,
    npcReply,
    npcRuntimeFixture,
} from './npcAiRuntimeFixture'

const fixtures: Array<ReturnType<typeof npcRuntimeFixture>> = []
beforeEach(() => {
    vi.stubGlobal('Bun', { env: {} })
    vi.useFakeTimers()
    vi.setSystemTime(1000)
})
afterEach(() => {
    fixtures.splice(0).forEach((fixture) => {
        fixture.room.stop()
    })
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

it('routes a forged follow command through model consent before any companion link', async () => {
    const provider = controlledNpcProvider()
    const f = npcRuntimeFixture(provider.decide)
    fixtures.push(f)
    f.alice.send({
        type: 'companion_request',
        request: 'follow',
        targetId: kaplyaId,
    })
    await f.advance()
    expect(f.actor.soul.companion?.leaderId).toBeNull()
    expect(provider.turns).toHaveLength(1)
    expect(provider.turns[0]?.context.events).toContainEqual(
        expect.objectContaining({
            kind: 'message',
            channel: 'whisper',
            text: 'Пойдём вместе: следуй за мной, если согласишься.',
        })
    )
    provider.turns[0]?.resolve(
        npcReply(null, {
            taskAcceptance: 'decline',
            speech: 'Пока останусь здесь.',
        })
    )
    await f.advance()
    expect(f.actor.soul.companion?.leaderId).toBeNull()
    f.alice.send({
        type: 'companion_request',
        request: 'follow',
        targetId: kaplyaId,
    })
    await f.advance()
    provider.turns[1]?.resolve(
        npcReply(null, {
            taskAcceptance: 'accept',
            companionOrder: 'follow',
            speech: 'Буль, пойдём.',
        })
    )
    await f.advance()
    expect(f.actor.soul.companion?.leaderId).toBe(f.alice.actor.id)
    f.alice.send({
        type: 'companion_request',
        request: 'dismiss',
        targetId: kaplyaId,
    })
    expect(f.actor.soul.companion?.leaderId).toBeNull()
})

it('does not let a forged help command override peaceful ability restrictions', async () => {
    const provider = controlledNpcProvider()
    const f = npcRuntimeFixture(provider.decide)
    fixtures.push(f)
    f.alice.send({
        type: 'companion_request',
        request: 'help',
        targetId: kaplyaId,
    })
    await f.advance()
    expect(f.actor.soul.companion?.leaderId).toBeNull()
    provider.turns[0]?.resolve(
        npcReply(null, { taskAcceptance: 'accept', companionOrder: 'help' })
    )
    await f.advance()
    expect(f.actor.soul.companion?.leaderId).toBeNull()
    expect(f.actor.soul.companion?.order).toBe('idle')
})
