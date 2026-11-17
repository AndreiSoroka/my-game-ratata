import { expect, it, vi } from 'vitest'

import type { KnowledgeResult } from '../src/ai/characterKnowledge'
import { parseNpcAiReply } from '../src/ai/codexCliProtocol'
import { defaultNpcAiSettings } from '../src/ai/config'
import schema from '../src/ai/decision-schema.json'
import { createNpcAiState } from '../src/ai/runtimeState'
import { invokeNpcAiTurn } from '../src/ai/turn'
import type {
    NpcAiContext,
    NpcAiReply,
    NpcInformationRequest,
} from '../src/ai/types'

const searchRequest = {
    type: 'knowledge_search',
    query: 'рубка дерева',
} as const
const result: KnowledgeResult = {
    groups: ['world.common'],
    entries: [
        {
            id: 'forestry.chopping',
            group: 'world.common',
            text: 'Дерево рубят исправным топором или мечом.',
            source: 'authored:knowledge:forestry.chopping',
        },
    ],
    memories: [],
}
const reply = (extra: Partial<NpcAiReply> = {}): NpcAiReply => ({
    decision: null,
    memory: '',
    done: true,
    waitMs: 1000,
    taskAcceptance: 'none',
    speech: null,
    ...extra,
})
function fixture() {
    const state = createNpcAiState(
        { actorId: 'npc', role: 'companion', settings: defaultNpcAiSettings },
        undefined
    )
    state.dialogue = {
        kind: 'message',
        id: 'input',
        senderId: 'player',
        text: 'Хочу срубить дерево',
        locationId: 'map-2-2',
        position: { x: 0, y: 0 },
        at: 1,
    }
    const context = {
        actorId: 'npc',
        role: 'companion',
        personality: '',
        task: null,
        events: [state.dialogue],
        memory: '',
        facts: [],
        observation: {},
        knowledgeScope: {
            topics: ['Лес и древесина'],
            expertise: [],
            canSearch: true,
            lookupsRemaining: 1,
        },
    } as unknown as NpcAiContext
    return { state, context }
}
function errorOf(state: ReturnType<typeof fixture>['state']): string {
    return state.ready !== undefined && 'error' in state.ready
        ? state.ready.error
        : ''
}

it('forwards the model-selected query and supplies one authorized result on the second call', async () => {
    const { state, context } = fixture()
    const calls: NpcAiContext[] = []
    const search = vi.fn(() => Promise.resolve(result))
    const reserve = vi.fn(() => true)
    await invokeNpcAiTurn(
        state,
        context,
        {
            decide: (input) => {
                calls.push(input)
                return Promise.resolve(
                    calls.length === 1
                        ? parseNpcAiReply(
                              reply({
                                  informationRequest: {
                                      type: 'knowledge_search',
                                      query: '  дерево, топор и пень  ',
                                  },
                              })
                          )
                        : reply({ speech: 'Нужен топор или меч.' })
                )
            },
        },
        () => true,
        { search, reserveCall: reserve }
    )
    expect(calls).toHaveLength(2)
    expect(calls[0]?.knowledge).toBeUndefined()
    expect(calls[0]?.knowledgeScope?.lookupsRemaining).toBe(1)
    expect(search).toHaveBeenCalledExactlyOnceWith('дерево, топор и пень')
    expect(calls[1]?.knowledge).toEqual({
        ...result,
        query: 'дерево, топор и пень',
    })
    expect(calls[1]?.informationResults).toBeUndefined()
    expect(calls[1]?.knowledgeScope).toMatchObject({
        canSearch: false,
        lookupsRemaining: 0,
    })
    expect(reserve).toHaveBeenCalledTimes(1)
    expect(state.ready).toMatchObject({
        reply: { speech: 'Нужен топор или меч.' },
    })
})

it('answers directly without retrieving, inheriting stale articles or reserving a second call', async () => {
    const { state, context } = fixture()
    context.knowledge = { ...result, query: 'previous question' }
    context.informationResults = { personId: 'old', status: 'not_known' }
    const search = vi.fn(() => Promise.resolve(result))
    const reserve = vi.fn(() => true)
    const calls: NpcAiContext[] = []
    await invokeNpcAiTurn(
        state,
        context,
        {
            decide: (input) => {
                calls.push(input)
                return Promise.resolve(reply({ speech: 'Привет!' }))
            },
        },
        () => true,
        { search, reserveCall: reserve }
    )
    expect(calls).toHaveLength(1)
    expect(calls[0]?.knowledge).toBeUndefined()
    expect(calls[0]?.informationResults).toBeUndefined()
    expect(search).not.toHaveBeenCalled()
    expect(reserve).not.toHaveBeenCalled()
    expect(context.knowledge.query).toBe('previous question')
})

it.each([
    { type: 'knowledge_search', query: '' },
    { type: 'knowledge_search', query: ' \n\t' },
    { type: 'knowledge_search', query: 'я'.repeat(301) },
    { type: 'knowledge_search', query: 7 },
    { type: 'knowledge_search', query: 'дерево', actorId: 'another-npc' },
    { type: 'knowledge_search', query: 'дерево', audiences: ['common'] },
    { type: 'knowledge_search', query: 'дерево', path: 'private.md' },
    { type: 'knowledge_search', personId: 'someone' },
])(
    'rejects an invalid or authority-selecting lookup request: %j',
    (informationRequest) => {
        expect(() =>
            parseNpcAiReply({ ...reply(), informationRequest })
        ).toThrow('Invalid information request')
    }
)

it('declares the same bounded query-only request in the isolated CLI reply schema', () => {
    expect(
        schema.properties.informationRequest.anyOf.find(
            (branch) => 'properties' in branch && 'query' in branch.properties
        )
    ).toMatchObject({
        additionalProperties: false,
        required: ['type', 'query'],
        properties: {
            type: { enum: ['knowledge_search'] },
            query: { minLength: 1, maxLength: 300, pattern: '\\S' },
        },
    })
    expect(
        parseNpcAiReply(
            reply({
                informationRequest: {
                    type: 'knowledge_search',
                    query: 'я'.repeat(300),
                },
            })
        ).informationRequest
    ).toEqual({ type: 'knowledge_search', query: 'я'.repeat(300) })
})

it.each<Partial<NpcAiReply>>([
    { speech: 'Уже знаю ответ.' },
    { decision: { type: 'wait' } },
    { taskAcceptance: 'accept' },
    { companionOrder: 'follow' },
])(
    'corrects then rejects a repeated mixed lookup without searching or applying it: %j',
    async (extra) => {
        const { state, context } = fixture()
        const search = vi.fn(() => Promise.resolve(result))
        const reserve = vi.fn(() => true)
        await invokeNpcAiTurn(
            state,
            context,
            {
                decide: () =>
                    Promise.resolve(
                        reply({ informationRequest: searchRequest, ...extra })
                    ),
            },
            () => true,
            { search, reserveCall: reserve }
        )
        expect(state.ready).toEqual({
            invalidReply: 'information_request_mixed',
        })
        expect(search).not.toHaveBeenCalled()
        expect(reserve).toHaveBeenCalledTimes(1)
    }
)

it.each<NpcInformationRequest>([
    searchRequest,
    { type: 'deep_memory', personId: 'someone' },
])(
    'uses one shared lookup allowance and refuses chaining into %j',
    async (next) => {
        const { state, context } = fixture()
        const search = vi.fn(() => Promise.resolve(result))
        const decide = vi.fn((input: NpcAiContext) =>
            Promise.resolve(
                reply({
                    informationRequest:
                        input.knowledge === undefined ? searchRequest : next,
                })
            )
        )
        await invokeNpcAiTurn(state, context, { decide }, () => true, {
            search,
            reserveCall: () => true,
        })
        expect(search).toHaveBeenCalledTimes(1)
        expect(decide).toHaveBeenCalledTimes(2)
        expect(errorOf(state)).toContain('One information lookup')
    }
)

it('does not perform a lookup or a second call after quota exhaustion', async () => {
    const { state, context } = fixture()
    const search = vi.fn(() => Promise.resolve(result))
    const decide = vi.fn(() =>
        Promise.resolve(reply({ informationRequest: searchRequest }))
    )
    await invokeNpcAiTurn(state, context, { decide }, () => true, {
        search,
        reserveCall: () => false,
    })
    expect(errorOf(state)).toContain('budget exhausted')
    expect(search).not.toHaveBeenCalled()
    expect(decide).toHaveBeenCalledTimes(1)
})

it('rejects search when the supplied scope cannot use another lookup', async () => {
    const { state, context } = fixture()
    context.knowledgeScope = {
        topics: [],
        expertise: [],
        canSearch: false,
        lookupsRemaining: 0,
    }
    const search = vi.fn(() => Promise.resolve(result))
    await invokeNpcAiTurn(
        state,
        context,
        {
            decide: () =>
                Promise.resolve(reply({ informationRequest: searchRequest })),
        },
        () => true,
        { search, reserveCall: () => true }
    )
    expect(errorOf(state)).toContain('unavailable')
    expect(search).not.toHaveBeenCalled()
})

it('does not invoke the model again if authority changes during lookup', async () => {
    const { state, context } = fixture()
    const pending = Promise.withResolvers<KnowledgeResult>()
    const started = Promise.withResolvers<undefined>()
    let current = true
    const decide = vi.fn(() =>
        Promise.resolve(reply({ informationRequest: searchRequest }))
    )
    const run = invokeNpcAiTurn(state, context, { decide }, () => true, {
        current: () => current,
        reserveCall: () => true,
        search: () => {
            started.resolve(undefined)
            return pending.promise
        },
    })
    await started.promise
    current = false
    pending.resolve(result)
    await run
    expect(decide).toHaveBeenCalledTimes(1)
    expect(errorOf(state)).toContain('cancelled')
})

it('keeps lookup and both model calls inside the original shared deadline', async () => {
    vi.useFakeTimers()
    try {
        const { state, context } = fixture()
        const pending = Promise.withResolvers<KnowledgeResult>()
        const decide = vi.fn(() =>
            Promise.resolve(reply({ informationRequest: searchRequest }))
        )
        const run = invokeNpcAiTurn(state, context, { decide }, () => true, {
            reserveCall: () => true,
            search: () => pending.promise,
        })
        await vi.advanceTimersByTimeAsync(0)
        await vi.advanceTimersByTimeAsync(state.config.settings.timeoutMs)
        await run
        expect(errorOf(state)).toContain('timed out')
        pending.resolve(result)
        await vi.advanceTimersByTimeAsync(0)
        expect(decide).toHaveBeenCalledTimes(1)
    } finally {
        vi.useRealTimers()
    }
})

it.each(['first', 'second'] as const)(
    'discards a reply when authority changes during the %s model call without a generation change',
    async (stage) => {
        const { state, context } = fixture()
        let current = true
        let calls = 0
        const generation = state.generation
        await invokeNpcAiTurn(
            state,
            context,
            {
                decide: () => {
                    calls += 1
                    if (stage === 'second' && calls === 1) {
                        return Promise.resolve(
                            reply({ informationRequest: searchRequest })
                        )
                    }
                    current = false
                    return Promise.resolve(
                        reply({ speech: 'Это устаревший ответ.' })
                    )
                },
            },
            () => true,
            {
                current: () => current,
                reserveCall: () => true,
                search: () => Promise.resolve(result),
            }
        )
        expect(state.generation).toBe(generation)
        expect(calls).toBe(stage === 'first' ? 1 : 2)
        expect(errorOf(state)).toContain('cancelled')
        expect(state.ready).not.toHaveProperty('reply')
    }
)
