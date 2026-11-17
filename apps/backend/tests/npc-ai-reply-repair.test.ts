import { expect, it, vi } from 'vitest'

import { defaultNpcAiSettings } from '../src/ai/config'
import { createNpcAiState } from '../src/ai/runtimeState'
import { invokeNpcAiTurn } from '../src/ai/turn'
import type { NpcAiContext, NpcAiReply } from '../src/ai/types'

const move = { type: 'move_to', target: { x: 100, y: 100 } } as const
const reply = (extra: Partial<NpcAiReply> = {}): NpcAiReply => ({
    decision: null,
    taskAcceptance: 'none',
    speech: null,
    memory: '',
    done: true,
    waitMs: 1000,
    ...extra,
})
function fixture() {
    const state = createNpcAiState(
        {
            actorId: 'kaplya',
            role: 'companion',
            settings: defaultNpcAiSettings,
        },
        undefined
    )
    state.dialogue = {
        kind: 'message',
        id: 'check-princess',
        senderId: 'player',
        text: 'проверь',
        locationId: 'map-2-2',
        position: { x: 0, y: 0 },
        at: 1,
    }
    const context = {
        actorId: 'kaplya',
        role: 'companion',
        personality: '',
        task: null,
        events: [state.dialogue],
        memory: 'Обсуждали принцессу в таверне.',
        facts: [],
        observation: {},
        taskConsent: {
            state: 'idle',
            allowed: ['none', 'accept', 'replace', 'decline'],
        },
        knowledgeScope: {
            topics: [],
            expertise: [],
            canSearch: true,
            lookupsRemaining: 1,
        },
    } as unknown as NpcAiContext
    return { state, context }
}

it.each(['accept', 'decline'] as const)(
    'lets the model choose %s on one correction without applying the rejected draft',
    async (choice) => {
        const { state, context } = fixture()
        const calls: NpcAiContext[] = []
        await invokeNpcAiTurn(
            state,
            context,
            {
                decide: (input) => {
                    calls.push(input)
                    return Promise.resolve(
                        calls.length === 1
                            ? reply({
                                  decision: move,
                                  speech: 'Я уже проверил.',
                                  memory: 'Неверный результат черновика.',
                              })
                            : reply({
                                  decision: choice === 'accept' ? move : null,
                                  taskAcceptance: choice,
                                  speech:
                                      choice === 'accept'
                                          ? 'Схожу посмотрю.'
                                          : 'Сейчас не возьмусь.',
                              })
                    )
                },
            },
            () => true,
            { reserveCall: () => true }
        )
        expect(calls).toHaveLength(2)
        expect(calls[1]?.replyCorrection).toMatchObject({
            code: 'task_consent_required',
            decision: move,
            taskAcceptance: 'none',
        })
        expect(calls[1]?.knowledgeScope).toMatchObject({
            canSearch: false,
            lookupsRemaining: 0,
        })
        expect(calls[1]?.memory).toBe(context.memory)
        expect(JSON.stringify(calls[1])).not.toContain(
            'Неверный результат черновика'
        )
        expect(state.mind.context('player', '').recent).toEqual([])
        expect(state.ready).toMatchObject({ reply: { taskAcceptance: choice } })
    }
)

it('communicates the replacement requirement without revealing a hidden task', async () => {
    const { state, context } = fixture()
    context.taskConsent = {
        state: 'own_task',
        allowed: ['none', 'replace', 'decline'],
    }
    let count = 0
    await invokeNpcAiTurn(
        state,
        context,
        {
            decide: (input) => {
                count += 1
                if (count === 2) {
                    expect(input.task).toBeNull()
                    expect(input.replyCorrection?.code).toBe(
                        'task_replace_required'
                    )
                }
                return Promise.resolve(
                    reply({
                        decision: move,
                        taskAcceptance: count === 1 ? 'accept' : 'replace',
                    })
                )
            },
        },
        () => true,
        { reserveCall: () => true }
    )
    expect(state.ready).toMatchObject({ reply: { taskAcceptance: 'replace' } })
})

it.each(['none', 'decline'] as const)(
    'rejects a repeated physical+%s answer finally, without a third call',
    async (taskAcceptance) => {
        const { state, context } = fixture()
        const decide = vi.fn(() =>
            Promise.resolve(reply({ decision: move, taskAcceptance }))
        )
        await invokeNpcAiTurn(state, context, { decide }, () => true, {
            reserveCall: () => true,
        })
        expect(decide).toHaveBeenCalledTimes(2)
        expect(state.ready).toEqual({ invalidReply: 'task_consent_required' })
        expect(state.modelCallsByInput.get('check-princess')).toBe(2)
    }
)

it('does not reserve or autoaccept when the correction budget is exhausted', async () => {
    const { state, context } = fixture()
    const decide = vi.fn(() => Promise.resolve(reply({ decision: move })))
    await invokeNpcAiTurn(state, context, { decide }, () => true, {
        reserveCall: () => false,
    })
    expect(decide).toHaveBeenCalledTimes(1)
    expect(state.ready).toEqual({ invalidReply: 'task_consent_required' })
})

it('repairs mixed lookup and speech silently, without doing the lookup or remembering its draft', async () => {
    const { state, context } = fixture()
    let count = 0
    const search = vi.fn(() =>
        Promise.resolve({ groups: [], entries: [], memories: [] })
    )
    await invokeNpcAiTurn(
        state,
        context,
        {
            decide: (input) => {
                count += 1
                if (count === 2) {
                    expect(input.replyCorrection?.code).toBe(
                        'information_request_mixed'
                    )
                }
                return Promise.resolve(
                    count === 1
                        ? reply({
                              informationRequest: {
                                  type: 'knowledge_search',
                                  query: 'число древесины',
                              },
                              speech: 'Число я выдумал.',
                              memory: 'Неверный черновик.',
                          })
                        : reply({ speech: 'Точного количества не знаю.' })
                )
            },
        },
        () => true,
        { reserveCall: () => true, search }
    )
    expect(count).toBe(2)
    expect(search).not.toHaveBeenCalled()
    expect(state.ready).toMatchObject({
        reply: { speech: 'Точного количества не знаю.' },
    })
    expect(state.mind.context('player', '').recent).toEqual([])
})

it('cannot add a correction after a lookup or a lookup after a correction', async () => {
    for (const lookupFirst of [true, false]) {
        const { state, context } = fixture()
        const search = vi.fn(() =>
            Promise.resolve({ groups: [], entries: [], memories: [] })
        )
        let count = 0
        await invokeNpcAiTurn(
            state,
            context,
            {
                decide: () => {
                    count += 1
                    return Promise.resolve(
                        (count === 1) === lookupFirst
                            ? reply({
                                  informationRequest: {
                                      type: 'knowledge_search',
                                      query: 'принцесса',
                                  },
                              })
                            : reply({ decision: move })
                    )
                },
            },
            () => true,
            { reserveCall: () => true, search }
        )
        expect(count).toBe(2)
        expect(search).toHaveBeenCalledTimes(lookupFirst ? 1 : 0)
        expect(state.ready).toHaveProperty('invalidReply')
    }
})

it('does not execute or retain a correction after its identity is cancelled', async () => {
    const { state, context } = fixture()
    let count = 0
    await invokeNpcAiTurn(
        state,
        context,
        {
            decide: () => {
                count += 1
                if (count === 2) {
                    state.generation += 1
                }
                return Promise.resolve(
                    reply({
                        decision: move,
                        taskAcceptance: count === 1 ? 'none' : 'accept',
                    })
                )
            },
        },
        () => true,
        { reserveCall: () => true }
    )
    expect(state.ready).toBeUndefined()
})

it('keeps a timed out correction terminal within the original deadline', async () => {
    vi.useFakeTimers()
    try {
        const { state, context } = fixture()
        let count = 0
        const run = invokeNpcAiTurn(
            state,
            context,
            {
                decide: () => {
                    count += 1
                    return count === 1
                        ? Promise.resolve(reply({ decision: move }))
                        : Promise.withResolvers<NpcAiReply>().promise
                },
            },
            () => true,
            { reserveCall: () => true }
        )
        await vi.advanceTimersByTimeAsync(state.config.settings.timeoutMs)
        await run
        expect(count).toBe(2)
        expect(state.ready).toEqual({ invalidReply: 'task_consent_required' })
    } finally {
        vi.useRealTimers()
    }
})
