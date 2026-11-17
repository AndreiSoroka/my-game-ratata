import { expect, it, vi } from 'vitest'

import { parseNpcAiReply } from '../src/ai/codexCliProtocol'
import { defaultNpcAiSettings } from '../src/ai/config'
import { createNpcAiState } from '../src/ai/runtimeState'
import { invokeNpcAiTurn } from '../src/ai/turn'
import type { NpcAiContext, NpcAiReply } from '../src/ai/types'

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
    state.mind.remember({
        id: 'heard',
        senderId: 'first-player',
        senderName: 'Первый',
        recipientId: 'npc',
        text: 'Спрашивал о северной заставе',
        channel: 'whisper',
        source: 'heard',
        at: 1,
        locationId: 'map-2-2',
    })
    const context = {
        actorId: 'npc',
        role: 'companion',
        personality: '',
        task: null,
        events: [],
        memory: '',
        facts: [],
        observation: {},
    } as unknown as NpcAiContext
    return { state, context }
}
it('performs one read-only lookup and one final call under the same turn', async () => {
    const { state, context } = fixture()
    const calls: NpcAiContext[] = []
    const reserve = vi.fn(() => true)
    await invokeNpcAiTurn(
        state,
        context,
        {
            decide: (input) => {
                calls.push(input)
                return Promise.resolve(
                    calls.length === 1
                        ? reply({
                              informationRequest: {
                                  type: 'deep_memory',
                                  personId: 'first-player',
                              },
                          })
                        : reply({ speech: 'Он спрашивал о заставе.' })
                )
            },
        },
        () => true,
        { reserveCall: reserve }
    )
    expect(calls).toHaveLength(2)
    expect(calls[1]?.informationResults).toMatchObject({
        personId: 'first-player',
        status: 'found',
    })
    expect(calls[1]?.informationResults?.messages?.[0]?.text).toContain(
        'северной'
    )
    expect(reserve).toHaveBeenCalledTimes(1)
    expect(state.task).toBeNull()
    expect(state.ready).toMatchObject({
        reply: { speech: 'Он спрашивал о заставе.' },
    })
})
it('rejects a lookup mixed with speaking or acting and does not reserve another call', async () => {
    const { state, context } = fixture()
    const reserve = vi.fn(() => true)
    await invokeNpcAiTurn(
        state,
        context,
        {
            decide: () =>
                Promise.resolve(
                    reply({
                        speech: 'Уже сделал',
                        informationRequest: {
                            type: 'deep_memory',
                            personId: 'first-player',
                        },
                    })
                ),
        },
        () => true,
        { reserveCall: reserve }
    )
    expect(reserve).toHaveBeenCalledTimes(1)
    expect(state.ready).toEqual({ invalidReply: 'information_request_mixed' })
})
it('refuses a second lookup and exhausted global call budget', async () => {
    for (const allowed of [false, true]) {
        const { state, context } = fixture()
        const decide = vi.fn(() =>
            Promise.resolve(
                reply({
                    informationRequest: {
                        type: 'deep_memory',
                        personId: 'missing',
                    },
                })
            )
        )
        await invokeNpcAiTurn(state, context, { decide }, () => true, {
            reserveCall: () => allowed,
        })
        expect(decide).toHaveBeenCalledTimes(allowed ? 2 : 1)
        expect(
            state.ready !== undefined && 'error' in state.ready
                ? state.ready.error.length
                : 0
        ).toBeGreaterThan(0)
    }
})
it('parses only bounded application memory requests, without enabling CLI tools', () => {
    expect(
        parseNpcAiReply(
            reply({
                informationRequest: { type: 'deep_memory', personId: 'person' },
            })
        ).informationRequest
    ).toEqual({ type: 'deep_memory', personId: 'person' })
    expect(() =>
        parseNpcAiReply({
            ...reply(),
            informationRequest: {
                type: 'deep_memory',
                personId: 'p',
                ownerId: 'other-npc',
            },
        })
    ).toThrow()
})

it('counts both calls across a retried source instead of allowing a third model invocation', async () => {
    const { state, context } = fixture()
    const provider = { decide: vi.fn(() => Promise.resolve(reply())) }
    state.modelCallsByInput.set(state.mind.conversationId, 2)
    await invokeNpcAiTurn(state, context, provider, () => true, {
        reserveCall: () => true,
    })
    expect(provider.decide).not.toHaveBeenCalled()
    expect(
        state.ready !== undefined && 'error' in state.ready
            ? state.ready.error
            : ''
    ).toContain('budget exhausted')
})
