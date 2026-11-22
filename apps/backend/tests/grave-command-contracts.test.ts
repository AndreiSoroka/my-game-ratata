import { materialDamage } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { parseAgentDecision } from '../src/game/agentDecisionParsing'
import { parseClientMessage } from '../src/game/messages'

const target = { kind: 'grave', id: 'map-2-1:grave:55:35' }
const commands = [
    { type: 'attack', target },
    { type: 'use_ability', abilityId: 'shot', target },
    { type: 'use_ability', abilityId: 'spark', target },
    { type: 'use_ability', abilityId: 'fireball', target },
    { type: 'auto_action', action: { kind: 'attack', target } },
    {
        type: 'auto_action',
        action: { kind: 'ability', abilityId: 'shot', target },
    },
    {
        type: 'use_ability',
        abilityId: 'pray',
        intent: { mode: 'purify_grave', target },
    },
    { type: 'cancel_prayer' },
] as const

describe('grave command boundaries shared by players and agents', () => {
    it.each(commands)(
        'preserves the explicit target and intent in $type',
        (command) => {
            expect(parseClientMessage(JSON.stringify(command)).message).toEqual(
                command
            )
            expect(parseAgentDecision(command)).toEqual(command)
        }
    )
    it.each([
        { type: 'attack', target, targetId: 'someone' },
        { type: 'attack', target: { kind: 'character', id: 'someone' } },
        { type: 'attack', target: { kind: 'grave', id: '' } },
        { type: 'attack', target: { ...target, ownerId: 'someone' } },
        { type: 'use_ability', abilityId: 'shot', target, targetId: 'someone' },
        {
            type: 'use_ability',
            abilityId: 'pray',
            intent: { mode: 'purify_grave', target, targetId: 'someone' },
        },
        {
            type: 'use_ability',
            abilityId: 'pray',
            intent: { mode: 'restore', target },
        },
        { type: 'cancel_prayer', target },
        {
            type: 'auto_action',
            action: { kind: 'attack', target, targetId: 'someone' },
        },
    ])('rejects ambiguous or forged targets: %j', (command) => {
        expect(
            parseClientMessage(JSON.stringify(command)).message
        ).toBeUndefined()
        expect(parseAgentDecision(command)).toBeUndefined()
    })
    it('accepts legacy character commands and explicit grave or forward spells', () => {
        expect(
            parseClientMessage(
                JSON.stringify({ type: 'attack', targetId: 'enemy' })
            ).message
        ).toEqual({ type: 'attack', targetId: 'enemy' })
        expect(
            parseClientMessage(
                JSON.stringify({
                    type: 'cast_spell',
                    skillId: 'fireball',
                    target,
                })
            ).message
        ).toEqual({ type: 'cast_spell', skillId: 'fireball', target })
        expect(
            parseClientMessage(
                JSON.stringify({ type: 'cast_spell', skillId: 'fireball' })
            ).message
        ).toEqual({ type: 'cast_spell', skillId: 'fireball' })
    })
})

describe('stone material balance retains small damage', () => {
    it.each([
        { impact: 'unarmed', raw: 5, expected: 0.5 },
        { impact: 'weapon', raw: 9, expected: 2.25 },
        { impact: 'stone_tool', raw: 5, expected: 5 },
        { impact: 'projectile', raw: 4, expected: 0.2 },
        { impact: 'projectile', raw: 7, expected: 0.35 },
        { impact: 'arcane', raw: 3, expected: 0.75 },
    ] as const)(
        '$impact: $raw becomes $expected',
        ({ impact, raw, expected }) => {
            expect(materialDamage('stone', impact, raw)).toBe(expected)
        }
    )
    it.each([0, -1, NaN, Infinity])(
        'ignores invalid or empty incoming damage %s',
        (amount) => {
            expect(materialDamage('stone', 'projectile', amount)).toBe(0)
        }
    )
})
