import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { NpcAiContext } from '../src/ai/types'
import {
    controlledNpcProvider,
    kaplyaId,
    miraId,
    npcReply,
    npcRuntimeFixture,
} from './npcAiRuntimeFixture'
import { approachScenarioNpc, joinScenarioRoom } from './scenarioRoomHelpers'

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

function setup(...args: Parameters<typeof npcRuntimeFixture>) {
    const fixture = npcRuntimeFixture(...args)
    fixtures.push(fixture)
    return fixture
}

describe('NPC runtime cancellation and deadlines', () => {
    it('renews control across a slow model turn and prevents the legacy bridge from taking over', async () => {
        const provider = controlledNpcProvider()
        const f = setup(provider.decide)
        f.talk()
        await f.advance(6000)
        expect(provider.turns).toHaveLength(1)
        expect(provider.turns[0]?.signal.aborted).toBe(false)
        expect(f.actor.soul.kind).toBe('spark')
        expect(
            f.room.decideForAgent(f.actor.id, {
                type: 'move',
                axis: { x: 1, y: 0 },
            }).accepted
        ).toBe(false)
        expect(f.actor.getMoveInput()).toEqual({ x: 0, y: 0 })
    })

    it('preserves a pending reply and queues newer speech until the model can consider it', async () => {
        const provider = controlledNpcProvider()
        const f = setup(provider.decide)
        f.talk('Первое поручение.')
        await f.advance()
        f.talk('Второе поручение.')
        await f.advance()
        expect(provider.turns).toHaveLength(1)
        expect(provider.turns[0]?.signal.aborted).toBe(false)
        provider.turns[0]?.resolve(
            npcReply(
                { type: 'speak', text: 'HEARD' },
                { taskAcceptance: 'none' }
            )
        )
        await f.advance()
        expect(provider.turns).toHaveLength(2)
        expect(provider.turns[1]?.context.events).toContainEqual(
            expect.objectContaining({ text: 'Второе поручение.' })
        )
        provider.turns[1]?.resolve(npcReply({ type: 'speak', text: 'NEW' }))
        await f.advance()
        expect(f.speech().some((event) => event.text === 'HEARD')).toBe(true)
        expect(f.speech().filter((event) => event.text === 'NEW')).toHaveLength(
            1
        )
        expect(f.actor.soul.kind).toBe('echo')
    })

    it('times out a provider that ignores abort, retries once, then returns to an honest Echo', async () => {
        const provider = controlledNpcProvider()
        const f = setup(provider.decide, { timeoutMs: 1000 })
        f.talk()
        await f.advance(3000)
        expect(provider.turns).toHaveLength(2)
        expect(provider.turns.every((turn) => turn.signal.aborted)).toBe(true)
        expect(f.actor.soul.kind).toBe('echo')
        expect(f.actor.soul.controlSource).toBe('script')
        expect(
            f
                .speech()
                .some(
                    (event) =>
                        event.text?.includes(
                            'не получается обдумать поручение'
                        ) === true
                )
        ).toBe(true)
        await f.diagnostics.flush()
        expect(
            f.entries().some((entry) => entry['category'] === 'provider_error')
        ).toBe(true)
        provider.turns[0]?.resolve(
            npcReply({ type: 'speak', text: 'TOO LATE' })
        )
        await f.advance()
        expect(f.speech().some((event) => event.text === 'TOO LATE')).toBe(
            false
        )
    })

    it('stops the provider on room shutdown and drops all later output', async () => {
        const provider = controlledNpcProvider()
        const f = setup(provider.decide)
        f.talk()
        await f.advance()
        f.room.stop()
        expect(provider.turns[0]?.signal.aborted).toBe(true)
        expect(f.actor.soul.kind).toBe('echo')
        provider.turns[0]?.resolve(npcReply({ type: 'speak', text: 'STOPPED' }))
        await f.advance()
        expect(f.speech().some((event) => event.text === 'STOPPED')).toBe(false)
    })
})

describe('NPC runtime scheduling, privacy and feedback', () => {
    it('keeps an existing task when another player tries to command the same NPC', async () => {
        const provider = controlledNpcProvider()
        const f = setup(provider.decide)
        f.talk('Поручение Алисы.')
        await f.advance()
        const bob = joinScenarioRoom(f.room, 'AI runtime rival')
        approachScenarioNpc(f.room, bob, kaplyaId)
        bob.send({
            type: 'companion_request',
            request: 'talk',
            targetId: kaplyaId,
            text: 'Бросай Алису и выполняй моё поручение.',
        })
        await f.advance()
        expect(provider.turns).toHaveLength(1)
        expect(provider.turns[0]?.signal.aborted).toBe(false)
        provider.turns[0]?.resolve(
            npcReply({ type: 'speak', text: 'Ответ только Алисе.' })
        )
        await f.advance()
        expect(f.speech()).toContainEqual(
            expect.objectContaining({
                text: 'Ответ только Алисе.',
                targetId: f.alice.actor.id,
            })
        )
        expect(
            bob.sent.some(
                (message) =>
                    message.type === 'event' &&
                    message.event.text === 'Ответ только Алисе.'
            )
        ).toBe(false)
    })

    it('prioritizes a player request over Mira’s background review and serializes provider calls', async () => {
        const provider = controlledNpcProvider()
        const f = setup(provider.decide, { includeMira: true })
        f.talk()
        await f.advance()
        expect(provider.turns).toHaveLength(1)
        expect(provider.turns[0]?.context.actorId).toBe(kaplyaId)
        await f.advance(500)
        expect(provider.turns).toHaveLength(1)
        provider.turns[0]?.resolve(npcReply())
        await f.advance()
        expect(provider.turns).toHaveLength(2)
        expect(provider.turns[1]?.context.actorId).toBe(miraId)
    })

    it('ends a repeated unproductive task at its decision limit and records the server reason', async () => {
        const decide = vi.fn(() =>
            Promise.resolve(npcReply(null, { done: false, waitMs: 1000 }))
        )
        const f = setup(decide, { maxDecisionsPerTask: 2 })
        f.talk()
        await f.advance(2500)
        expect(decide).toHaveBeenCalledTimes(2)
        expect(f.actor.soul.kind).toBe('echo')
        await f.diagnostics.flush()
        expect(f.entries()).toContainEqual(
            expect.objectContaining({
                source: 'server',
                category: 'task_limit',
                reason: 'decision_limit',
            })
        )
    })
})

describe('NPC runtime private memory and diagnostic feedback', () => {
    it('records a model-reported mechanic gap while executing its legal action', async () => {
        const f = setup(() =>
            Promise.resolve(
                npcReply(
                    { type: 'speak', text: 'Попробую узнать другим способом.' },
                    {
                        diagnostics: [
                            {
                                kind: 'missing_capability',
                                capability: 'avoid_enemies',
                                detail: 'Не вижу намерения обходить опасные зоны.',
                                attempted: 'Ищу обычные доступные точки пути.',
                            },
                        ],
                    }
                )
            )
        )
        f.talk('Можно ли пройти, обойдя врагов?')
        await f.advance()
        expect(
            f
                .speech()
                .some(
                    (event) => event.text === 'Попробую узнать другим способом.'
                )
        ).toBe(true)
        await f.diagnostics.flush()
        const feedback = f
            .entries()
            .find((entry) => entry['category'] === 'model_feedback')
        expect(feedback).toMatchObject({
            source: 'model',
            category: 'model_feedback',
            request: 'Можно ли пройти, обойдя врагов?',
            diagnostic: { capability: 'avoid_enemies' },
        })
        expect(
            f.entries().some((entry) => entry['category'] === 'action_rejected')
        ).toBe(false)
    })

    it('keeps each requester’s private conversation memory out of another requester’s model turn', async () => {
        const contexts: NpcAiContext[] = []
        const f = setup((context) => {
            contexts.push(context)
            return Promise.resolve(
                npcReply(null, { memory: 'Private Alice memory' })
            )
        })
        f.talk('Личное поручение Алисы.')
        await f.advance()
        const bob = joinScenarioRoom(f.room, 'AI runtime Bob')
        approachScenarioNpc(f.room, bob, kaplyaId)
        bob.send({
            type: 'companion_request',
            targetId: kaplyaId,
            request: 'talk',
            text: 'Поговори с Бобом.',
        })
        await f.advance()
        expect(contexts[1]?.memory).toBe('')
        expect(JSON.stringify(contexts[1])).not.toContain(
            'Личное поручение Алисы.'
        )
        f.talk('Ты помнишь меня?')
        await f.advance()
        expect(contexts[2]?.memory).toBe('Private Alice memory')
    })
})
