import { describe, expect, it } from 'vitest'

import { parseClientMessage } from '../src/game/messages'

function parse(message: unknown) {
    return parseClientMessage(JSON.stringify(message))
}

describe('validated practice and companion protocol', () => {
    it.each([
        { type: 'pray' },
        { type: 'party_answer', invitationId: 'invite', accept: false },
        { type: 'guild_accept', questId: 'slime_hunt' },
        { type: 'choose_deity', targetId: 'cleric', deityId: 'road' },
        { type: 'study_magic', targetId: 'scholar' },
        { type: 'teach_magic', targetId: 'student' },
        { type: 'learn_skill', skillId: 'fireball', targetId: 'teacher' },
        { type: 'cast_spell', skillId: 'greater_fireball', targetId: 'slime' },
        { type: 'companion_request', request: 'follow', targetId: 'veteran' },
    ])('accepts a supported intention: %j', (message) => {
        expect(parse(message)).toEqual({ message })
    })

    it.each([
        { type: 'choose_deity', targetId: 'cleric', deityId: 'admin' },
        { type: 'teach_magic', targetId: 42 },
        { type: 'party_answer', invitationId: 'invite', accept: 'true' },
        { type: 'guild_accept', questId: 'free_gold' },
        { type: 'cast_spell', skillId: 'admin_kill', targetId: 'slime' },
        { type: 'cast_spell', skillId: 'fireball', targetId: '' },
        {
            type: 'learn_skill',
            skillId: 'greater_fireball',
            targetId: 'teacher',
        },
        { type: 'companion_request', request: 'possess', targetId: 'veteran' },
        {
            type: 'companion_request',
            request: 'talk',
            targetId: 'veteran',
            text: {},
        },
        {
            type: 'companion_request',
            request: 'follow',
            targetId: 'x'.repeat(101),
        },
    ])('rejects malformed or unauthorized action shape: %j', (message) => {
        expect(parse(message).message).toBeUndefined()
    })

    it('bounds dialogue input and does not accept a forged actor identity', () => {
        const result = parse({
            type: 'companion_request',
            request: 'talk',
            targetId: 'veteran',
            actorId: 'another_player',
            text: 'x'.repeat(1000),
        })
        expect(result.message).toEqual({
            type: 'companion_request',
            request: 'talk',
            targetId: 'veteran',
            text: 'x'.repeat(400),
        })
    })
})
