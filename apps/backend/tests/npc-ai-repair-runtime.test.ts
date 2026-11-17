import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { memoryForCharacter } from '../src/ai/characterMinds'
import { snapshotControl } from '../src/game/characterControl'
import {
    controlledNpcProvider,
    kaplyaId,
    npcReply,
    npcRuntimeFixture,
} from './npcAiRuntimeFixture'
import { joinScenarioRoom, nearbyScenarioPoint } from './scenarioRoomHelpers'

const fixtures: Array<ReturnType<typeof npcRuntimeFixture>> = []
beforeEach(() => {
    vi.stubGlobal('Bun', { env: {} })
    vi.useFakeTimers()
    vi.setSystemTime(1000)
})
afterEach(async () => {
    for (const f of fixtures.splice(0)) {
        f.room.stop()
        await f.diagnostics.flush()
    }
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

it('keeps rejected promises and memory private until a real explicit acceptance', async () => {
    const provider = controlledNpcProvider()
    const f = npcRuntimeFixture(provider.decide)
    fixtures.push(f)
    f.alice.send({
        type: 'chat',
        targetId: kaplyaId,
        text: 'Проверь, есть ли принцесса в таверне.',
    })
    await f.advance()
    const target = nearbyScenarioPoint(f.room, f.actor)
    provider.turns[0]?.resolve(
        npcReply(
            { type: 'move_to', target },
            {
                speech: 'Принцесса уже найдена!',
                memory: 'Выдуманный результат.',
                taskAcceptance: 'none',
                done: false,
            }
        )
    )
    await f.advance()
    expect(provider.turns).toHaveLength(2)
    expect(f.actor.hasPath()).toBe(false)
    expect(f.speech().map((event) => event.text)).not.toContain(
        'Принцесса уже найдена!'
    )
    expect(
        JSON.stringify(
            memoryForCharacter(f.actor).context(f.alice.actor.id, 'принцесса')
        )
    ).not.toContain('Выдуманный результат')
    provider.turns[1]?.resolve(
        npcReply(
            { type: 'move_to', target },
            {
                speech: 'Загляну в таверну и вернусь.',
                taskAcceptance: 'accept',
                done: false,
            }
        )
    )
    await f.advance(50)
    expect(snapshotControl(f.actor).mode).toBe('route')
    expect(
        f
            .speech()
            .filter((event) => event.text === 'Загляну в таверну и вернусь.')
    ).toHaveLength(1)
})

it('ends a repeatedly inconsistent input once and never queues a third model attempt', async () => {
    const contexts: unknown[] = []
    const f = npcRuntimeFixture((context) => {
        contexts.push(context)
        return Promise.resolve(
            npcReply(
                { type: 'move_to', target: { x: 400, y: 1000 } },
                {
                    taskAcceptance: 'none',
                    speech: 'Уже всё проверено!',
                    memory: 'Ложный отчёт.',
                }
            )
        )
    })
    fixtures.push(f)
    f.alice.send({ type: 'chat', targetId: kaplyaId, text: 'Проверь таверну.' })
    await f.advance(1_500)
    expect(contexts).toHaveLength(2)
    expect(
        f.entries().filter((entry) => entry['category'] === 'provider_error')
    ).toEqual([])
    expect(f.actor.hasPath()).toBe(false)
    expect(f.speech().map((event) => event.text)).toEqual([
        'Сейчас не получилось начать поручение.',
    ])
    expect(
        f
            .entries()
            .filter(
                (entry) =>
                    entry['category'] === 'request_status' &&
                    String(entry['reason']).startsWith('failed')
            )
    ).toHaveLength(1)
    expect(
        JSON.stringify(
            memoryForCharacter(f.actor).context(f.alice.actor.id, 'почему')
        )
    ).not.toContain('Ложный отчёт')
})

it('exposes own replacement capability across channels without disclosing another owner', async () => {
    const provider = controlledNpcProvider()
    const f = npcRuntimeFixture(provider.decide)
    fixtures.push(f)
    f.talk('Сходи к торговцу.')
    await f.advance()
    provider.turns[0]?.resolve(
        npcReply(
            { type: 'move_to', target: nearbyScenarioPoint(f.room, f.actor) },
            {
                taskAcceptance: 'accept',
                done: false,
            }
        )
    )
    await f.advance(50)
    f.alice.send({
        type: 'chat',
        targetId: kaplyaId,
        text: 'Лучше проверь таверну.',
    })
    await f.advance(50)
    expect(provider.turns[1]?.context.task).toBeNull()
    expect(provider.turns[1]?.context.taskConsent).toEqual({
        state: 'own_task',
        allowed: ['none', 'replace', 'decline'],
    })
    provider.turns[1]?.resolve(npcReply(null, { taskAcceptance: 'none' }))
    await f.advance(50)
    const bob = joinScenarioRoom(f.room, 'Bob')
    // Domain fixture arranges a second hearer nearby; his subsequent command uses normal speech.
    bob.actor.position = { ...f.actor.position }
    bob.send({
        type: 'chat',
        targetId: kaplyaId,
        text: 'Брось старое поручение.',
    })
    await f.advance(50)
    const context = provider.turns.at(-1)?.context
    expect(context?.taskConsent).toEqual({
        state: 'busy',
        allowed: ['none', 'decline'],
    })
    expect(context?.task).toBeNull()
    expect(context?.taskConsent).not.toHaveProperty('ownerId')
})
