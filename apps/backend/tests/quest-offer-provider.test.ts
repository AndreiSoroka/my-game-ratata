import { readFileSync } from 'node:fs'

import { expect, it } from 'vitest'

import { parseCodexResult, parseNpcAiReply } from '../src/ai/codexCliProtocol'
import { parseNpcQuestDecision } from '../src/game/npcQuestCommands'
import { npcQuestFixture } from './npcQuestFixture'

it.each([true, false])(
    'accepts the actual CLI invitation answer protocol: show=%s',
    (show) => {
        const decision = {
            type: 'quest_invitation_answer',
            targetId: 'player-1',
            invitationId: 'invite-1',
            show,
        }
        const reply = {
            decision,
            speech: 'Обсудим дело.',
            taskAcceptance: 'none',
            companionOrder: null,
            memory: '',
            done: true,
            waitMs: 0,
        }
        const stdout = [
            JSON.stringify({
                type: 'item.completed',
                item: { type: 'agent_message', text: JSON.stringify(reply) },
            }),
            JSON.stringify({ type: 'turn.completed', usage: {} }),
        ].join('\n')
        expect(parseCodexResult(stdout).reply.decision).toEqual(decision)
        expect(() =>
            parseNpcAiReply({
                ...reply,
                decision: { ...decision, show: 'yes' },
            })
        ).toThrow('Invalid NPC AI reply')
    }
)

it.each(['quest_propose', 'worker_quest_propose'] as const)(
    'normalizes a strict-provider nullable replacement for %s without relaxing network parsing',
    (type) => {
        const f = npcQuestFixture()
        const proposal =
            type === 'quest_propose'
                ? { type, targetId: f.player.id, draft: f.draft() }
                : { type, targetId: f.player.id, requestId: 'request-1' }
        const decision = { ...proposal, replaceOffer: null }
        expect(
            parseNpcAiReply({ decision, memory: '', done: true, waitMs: 0 })
                .decision
        ).toEqual(proposal)
        expect(decision.replaceOffer).toBeNull()
        expect(parseNpcQuestDecision(decision)).toBeUndefined()
        const replaceOffer = { offerId: 'offer-1', revision: 2 }
        expect(
            parseNpcAiReply({
                decision: { ...proposal, replaceOffer },
                memory: '',
                done: true,
                waitMs: 0,
            }).decision
        ).toEqual({ ...proposal, replaceOffer })
    }
)

it('keeps every provider object strict, requiring nullable optional fields explicitly', () => {
    const schema: unknown = JSON.parse(
        readFileSync(
            new URL('../src/ai/decision-schema.json', import.meta.url),
            'utf8'
        )
    )
    const check = (value: unknown): void => {
        if (Array.isArray(value)) {
            for (const entry of value) {
                check(entry)
            }
            return
        }
        if (value === null || typeof value !== 'object') {
            return
        }
        if (
            'properties' in value &&
            typeof value.properties === 'object' &&
            value.properties !== null
        ) {
            expect(
                'additionalProperties' in value && value.additionalProperties
            ).toBe(false)
            expect('required' in value ? value.required : []).toEqual(
                Object.keys(value.properties)
            )
        }
        for (const entry of Object.values(value)) {
            check(entry)
        }
    }
    check(schema)
})
