import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { npcAiCityFingerprint } from '../src/ai/cityReview'
import {
    controlledNpcProvider,
    npcReply,
    npcRuntimeFixture,
} from './npcAiRuntimeFixture'
import { joinScenarioRoom } from './scenarioRoomHelpers'

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
function setup(limits: Parameters<typeof npcRuntimeFixture>[1] = {}) {
    const provider = controlledNpcProvider()
    const f = npcRuntimeFixture(provider.decide, limits)
    fixtures.push(f)
    return { ...f, provider }
}

async function answerFirstRequest(f: ReturnType<typeof setup>) {
    f.talk('Первое сообщение.')
    await f.advance()
    expect(f.provider.turns).toHaveLength(1)
    f.provider.turns[0]?.resolve(npcReply(null, { speech: 'Буль!' }))
    await f.advance()
}

async function expectBudgetFailure(
    f: ReturnType<typeof setup>,
    request: string
) {
    await f.diagnostics.flush()
    expect(f.entries()).toContainEqual(
        expect.objectContaining({
            category: 'request_status',
            request,
            reason: 'failed:Лимит размышлений исчерпан. Попробуй позже.',
        })
    )
}

function secondPlayerTalks(f: ReturnType<typeof setup>, request: string) {
    const bob = joinScenarioRoom(f.room, 'AI runtime Bob')
    bob.actor.position = { ...f.alice.actor.position }
    bob.send({
        type: 'companion_request',
        request: 'talk',
        targetId: f.actor.id,
        text: request,
    })
}

it('keeps ordinary following moving while a conversational model reply is pending', async () => {
    const f = setup()
    f.talk('Пойдём вместе.')
    await f.advance()
    f.provider.turns[0]?.resolve(
        npcReply(null, { taskAcceptance: 'accept', companionOrder: 'follow' })
    )
    await f.advance()
    f.talk('Как настроение?')
    await f.advance()
    const before = { ...f.actor.position }
    f.alice.send({
        type: 'move_to',
        target: { x: f.actor.position.x + 96, y: f.actor.position.y },
    })
    await f.advance(1000)
    expect(f.provider.turns[1]?.signal.aborted).toBe(false)
    expect(
        Math.hypot(f.actor.position.x - before.x, f.actor.position.y - before.y)
    ).toBeGreaterThan(1)
})

it('corrects once then rejects a repeated physical reply without consent and reports the actual request', async () => {
    const f = setup()
    f.alice.send({
        type: 'chat',
        text: 'Подойди к гильдии.',
        targetId: f.actor.id,
    })
    await f.advance()
    const before = { ...f.actor.position }
    f.provider.turns[0]?.resolve(
        npcReply(
            { type: 'move_to', target: { x: before.x + 32, y: before.y } },
            { taskAcceptance: 'none', done: false }
        )
    )
    await f.advance()
    expect(f.actor.position).toEqual(before)
    expect(f.provider.turns[1]?.context.replyCorrection?.code).toBe(
        'task_consent_required'
    )
    f.provider.turns[1]?.resolve(
        npcReply(
            { type: 'move_to', target: { x: before.x + 32, y: before.y } },
            { taskAcceptance: 'none', done: false }
        )
    )
    await f.advance()
    expect(f.actor.position).toEqual(before)
    await f.diagnostics.flush()
    expect(f.entries()).toContainEqual(
        expect.objectContaining({
            category: 'action_rejected',
            reason: 'task_consent_required',
            request: 'Подойди к гильдии.',
        })
    )
    expect(
        f
            .entries()
            .some(
                (entry) =>
                    entry['category'] === 'request_status' &&
                    typeof entry['reason'] === 'string' &&
                    entry['reason'].startsWith('failed:')
            )
    ).toBe(true)
})

it('acknowledges a fresh request immediately when the hourly allowance is exhausted', async () => {
    const f = setup({ maxCallsPerHour: 1 })
    await answerFirstRequest(f)
    const request = 'Второе сообщение.'
    f.talk(request)
    await f.advance()
    expect(f.provider.turns).toHaveLength(1)
    await expectBudgetFailure(f, request)
})

it('keeps a fresh request queued when the next minute slot is less than ten seconds away', async () => {
    const f = setup({ maxCallsPerMinute: 1 })
    await answerFirstRequest(f)

    vi.setSystemTime(55_000)
    const request = 'Второе сообщение.'
    f.talk(request)
    await f.advance()
    expect(f.provider.turns).toHaveLength(1)
    await f.diagnostics.flush()
    expect(f.entries()).toContainEqual(
        expect.objectContaining({ request, reason: 'queued' })
    )
    expect(
        f
            .entries()
            .some(
                (entry) =>
                    entry['request'] === request &&
                    typeof entry['reason'] === 'string' &&
                    entry['reason'].startsWith('failed:')
            )
    ).toBe(false)

    vi.setSystemTime(60_000)
    await f.advance()
    expect(f.provider.turns).toHaveLength(1)

    vi.setSystemTime(61_500)
    await f.advance()
    expect(f.provider.turns).toHaveLength(2)
    expect(f.provider.turns[1]?.context.events).toContainEqual(
        expect.objectContaining({ text: request })
    )
    f.provider.turns[1]?.resolve(npcReply(null, { speech: 'Вот мой ответ.' }))
    await f.advance()
    expect(
        f.speech().filter((event) => event.text === 'Вот мой ответ.')
    ).toHaveLength(1)
})

it('rejects a long minute wait and never starts the rejected request when the slot opens', async () => {
    const f = setup({ maxCallsPerMinute: 1 })
    await answerFirstRequest(f)

    const request = 'Жду ответа.'
    f.talk(request)
    await f.advance()
    await expectBudgetFailure(f, request)
    vi.setSystemTime(61_500)
    await f.advance()
    expect(f.provider.turns).toHaveLength(1)
    f.talk('Теперь попробуем снова.')
    await f.advance()
    expect(f.provider.turns).toHaveLength(2)
})

it('expires a minute wait when the provider is still busy after ten seconds', async () => {
    const f = setup({ maxCallsPerMinute: 2, timeoutMs: 60_000 })
    await answerFirstRequest(f)

    vi.setSystemTime(55_000)
    f.talk('Займись вторым вопросом.')
    await f.advance()
    expect(f.provider.turns).toHaveLength(2)
    const request = 'Вопрос второго собеседника.'
    secondPlayerTalks(f, request)
    await f.advance()
    await f.diagnostics.flush()
    expect(f.entries()).toContainEqual(
        expect.objectContaining({ request, reason: 'queued' })
    )

    for (const wall of [59_000, 63_000, 65_500]) {
        vi.setSystemTime(wall)
        await f.advance()
    }
    await expectBudgetFailure(f, request)
    expect(f.provider.turns[1]?.signal.aborted).toBe(false)
    f.provider.turns[1]?.resolve(npcReply(null, { speech: 'Буль!' }))
    await f.advance()
    expect(f.provider.turns).toHaveLength(2)
})

it('rejects immediately while the last admitted turn keeps both windows full', async () => {
    const f = setup({
        maxCallsPerMinute: 1,
        maxCallsPer10Minutes: 1,
        timeoutMs: 60_000,
    })
    f.talk('Первое сообщение.')
    await f.advance()
    expect(f.provider.turns).toHaveLength(1)

    const request = 'Жду ответа после всплеска.'
    secondPlayerTalks(f, request)
    await f.advance()
    await expectBudgetFailure(f, request)
    expect(f.provider.turns[0]?.signal.aborted).toBe(false)
    f.provider.turns[0]?.resolve(npcReply(null, { speech: 'Буль!' }))
    await f.advance()
    vi.setSystemTime(61_500)
    await f.advance()
    expect(f.provider.turns).toHaveLength(1)
    vi.setSystemTime(601_500)
    await f.advance()
    expect(f.provider.turns).toHaveLength(1)
    f.talk('Теперь попробуем снова.')
    await f.advance()
    expect(f.provider.turns).toHaveLength(2)
})

it('charges a correction against the same minute quota as the initial reply', async () => {
    const f = setup({ maxCallsPerMinute: 2 })
    f.alice.send({
        type: 'chat',
        text: 'Подойди к гильдии.',
        targetId: f.actor.id,
    })
    await f.advance()
    const before = f.actor.position
    f.provider.turns[0]?.resolve(
        npcReply(
            { type: 'move_to', target: { x: before.x + 32, y: before.y } },
            { taskAcceptance: 'none', done: false }
        )
    )
    await f.advance()
    expect(f.provider.turns[1]?.context.replyCorrection?.code).toBe(
        'task_consent_required'
    )
    f.provider.turns[1]?.resolve(npcReply(null, { speech: 'Буль!' }))
    await f.advance()

    const request = 'Следующий вопрос.'
    f.talk(request)
    await f.advance()
    expect(f.provider.turns).toHaveLength(2)
    await expectBudgetFailure(f, request)
})

it('charges a provider retry against the same ten-minute quota as the initial attempt', async () => {
    const f = setup({ maxCallsPer10Minutes: 2, timeoutMs: 1_000 })
    f.talk('Сколько будет дважды два?')
    await f.advance(2_000)
    expect(f.provider.turns).toHaveLength(2)
    expect(f.provider.turns[0]?.signal.aborted).toBe(true)
    f.provider.turns[1]?.resolve(npcReply(null, { speech: 'Четыре!' }))
    await f.advance()

    const request = 'Следующий вопрос.'
    f.talk(request)
    await f.advance()
    expect(f.provider.turns).toHaveLength(2)
    await expectBudgetFailure(f, request)
})

it('cancels a pending reply when the speaker leaves range', async () => {
    const f = setup()
    f.talk('Подскажешь дорогу?')
    await f.advance()
    f.alice.send({
        type: 'move_to',
        target: { x: f.actor.position.x + 200, y: f.actor.position.y },
    })
    await f.advance(1600)
    expect(f.provider.turns[0]?.signal.aborted).toBe(true)
    const text = 'Ответ после ухода.'
    f.provider.turns[0]?.resolve(
        npcReply(null, { speech: text, taskAcceptance: 'none' })
    )
    await f.advance()
    expect(f.speech().some((event) => event.text === text)).toBe(false)
})

it('guides with an ordinary route and pauses when the requester does not follow', async () => {
    const f = setup()
    f.talk('Покажи гильдию.')
    await f.advance()
    const guild = f.provider.turns[0]?.context.observation.targets.find(
        (target) =>
            target.kind === 'building' &&
            target.name.toLocaleLowerCase().includes('гильд')
    )
    expect(guild).toBeDefined()
    const before = { ...f.actor.position }
    f.provider.turns[0]?.resolve(
        npcReply(
            { type: 'guide', targetKey: guild?.key ?? '' },
            {
                taskAcceptance: 'accept',
                done: false,
                speech: 'Пойдём, покажу гильдию.',
            }
        )
    )
    await f.advance(2000)
    expect(
        Math.hypot(f.actor.position.x - before.x, f.actor.position.y - before.y)
    ).toBeGreaterThan(1)
    const paused = { ...f.actor.position }
    await f.advance(1000)
    expect(f.actor.position).toEqual(paused)
    expect(f.provider.turns).toHaveLength(1)
    f.alice.send({ type: 'move_to', target: { ...f.actor.position } })
    await f.advance(1200)
    expect(
        Math.hypot(f.actor.position.x - paused.x, f.actor.position.y - paused.y)
    ).toBeGreaterThan(1)
    for (
        let elapsed = 0;
        elapsed < 20_000 && f.provider.turns.length === 1;
        elapsed += 200
    ) {
        f.alice.send({ type: 'move_to', target: { ...f.actor.position } })
        await f.advance(200)
    }
    expect(f.provider.turns).toHaveLength(2)
    expect(f.provider.turns[1]?.context.events).toContainEqual(
        expect.objectContaining({
            kind: 'action',
            status: 'completed',
            reason: 'arrived_with_requester',
        })
    )
    expect(
        Math.hypot(
            f.actor.position.x - (guild?.position.x ?? 0),
            f.actor.position.y - (guild?.position.y ?? 0)
        )
    ).toBeLessThanOrEqual(1)
})

it('returns a newly accepted wait to the NPC position at the moment the request was heard', async () => {
    const f = setup()
    f.talk('Пойдём вместе.')
    await f.advance()
    f.provider.turns[0]?.resolve(
        npcReply(null, { taskAcceptance: 'accept', companionOrder: 'follow' })
    )
    await f.advance()
    f.talk('Подожди здесь.')
    await f.advance()
    const heard = { ...f.actor.position }
    f.alice.send({ type: 'move_to', target: { x: heard.x + 96, y: heard.y } })
    await f.advance(800)
    expect(
        Math.hypot(f.actor.position.x - heard.x, f.actor.position.y - heard.y)
    ).toBeGreaterThan(1)
    f.provider.turns[1]?.resolve(
        npcReply(null, { taskAcceptance: 'accept', companionOrder: 'wait' })
    )
    await f.advance(2500)
    expect(f.actor.soul.companion?.order).toBe('wait')
    expect(
        Math.hypot(f.actor.position.x - heard.x, f.actor.position.y - heard.y)
    ).toBeLessThanOrEqual(1)
})

it('does not treat worker observation timestamps as a meaningful city change', () => {
    const first = {
        workers: [
            {
                id: 'worker',
                activity: {
                    intent: 'wait',
                    reason: 'resources',
                    observedAt: 1000,
                    since: 500,
                    lastResult: { receiptId: 'work:1' },
                },
            },
        ],
    }
    const later = {
        workers: [
            {
                id: 'worker',
                activity: {
                    intent: 'wait',
                    reason: 'resources',
                    observedAt: 2000,
                    since: 1500,
                    lastResult: { receiptId: 'work:1' },
                },
            },
        ],
    }
    expect(npcAiCityFingerprint(first)).toBe(npcAiCityFingerprint(later))
    const changedWorker = later.workers[0]
    if (changedWorker === undefined) {
        throw new Error('Missing worker fixture')
    }
    changedWorker.activity.lastResult.receiptId = 'work:2'
    expect(npcAiCityFingerprint(first)).not.toBe(npcAiCityFingerprint(later))
})

it('reserves calls for a player after background reviews use their allowance', async () => {
    const f = setup({ maxCallsPerHour: 3, includeMira: true })
    await f.advance()
    f.provider.turns[0]?.resolve(npcReply(null, { done: false, waitMs: 1000 }))
    await f.advance(1100)
    f.provider.turns[1]?.resolve(npcReply(null, { done: false, waitMs: 1000 }))
    await f.advance(1100)
    expect(f.provider.turns).toHaveLength(2)
    f.talk('Покажи дорогу.')
    await f.advance()
    expect(f.provider.turns).toHaveLength(3)
    expect(f.provider.turns[2]?.context.actorId).toBe(f.actor.id)
})

it('does not execute a model action computed before an until-return control transition', async () => {
    const f = setup()
    f.talk('Жди, пока я вернусь.')
    await f.advance()
    f.provider.turns[0]?.resolve(
        npcReply(null, {
            taskAcceptance: 'accept',
            companionOrder: 'wait',
            waitMode: 'until_return',
        })
    )
    await f.advance()
    f.talk('Как настроение?')
    await f.advance()
    const before = { ...f.actor.position }
    f.alice.actor.position = { x: before.x + 100, y: before.y }
    await f.advance()
    expect(f.provider.turns[1]?.signal.aborted).toBe(true)
    f.alice.actor.position = { x: before.x + 20, y: before.y }
    await f.advance()
    expect(f.actor.soul.companion?.order).toBe('follow')
    f.provider.turns[1]?.resolve(
        npcReply(
            { type: 'move_to', target: { x: before.x + 80, y: before.y } },
            { taskAcceptance: 'accept', done: false }
        )
    )
    await f.advance()
    expect(f.actor.position).toEqual(before)
    expect(f.provider.turns).toHaveLength(2)
})

it('aborts a dead NPC turn and requires a new human request after revival', async () => {
    const f = setup()
    f.talk('Сходи к гильдии.')
    await f.advance()
    f.actor.alive = false
    await f.advance()
    expect(f.provider.turns[0]?.signal.aborted).toBe(true)
    f.actor.alive = true
    f.provider.turns[0]?.resolve(
        npcReply(
            {
                type: 'move_to',
                target: { x: f.actor.position.x + 32, y: f.actor.position.y },
            },
            { taskAcceptance: 'accept', done: false }
        )
    )
    await f.advance(2000)
    expect(f.provider.turns).toHaveLength(1)
    f.talk('Начнём новое поручение.')
    await f.advance()
    expect(f.provider.turns).toHaveLength(2)
})
