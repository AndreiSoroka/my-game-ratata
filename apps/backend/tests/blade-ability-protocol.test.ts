import { bladeAbilityIds } from '@my-game-ratata/contracts'
import { expect, it, vi } from 'vitest'

import { npcAiDecisionError } from '../src/ai/actions'
import { parseNpcAiReply } from '../src/ai/codexCliProtocol'
import decisionSchema from '../src/ai/decision-schema.json'
import { npcAiCapabilities } from '../src/ai/observationPolicy'
import { parseAbilityCommand } from '../src/game/abilityCommands'
import { applyAgentAbility } from '../src/game/agentCapabilities'
import {
    type CompanionWorld,
    parseAgentDecision,
} from '../src/game/agentDecisions'
import { GameCharacter } from '../src/game/character'
import { npcReply } from './npcAiRuntimeFixture'

function actor(id = 'blade-sentry') {
    return new GameCharacter({
        id,
        nickname: 'Страж',
        archetype: 'human',
        controllerKind: 'scripted',
        spawnPosition: { x: 0, y: 0 },
    })
}

it.each(bladeAbilityIds)(
    'shares the ordinary player and NPC command parser for %s',
    (abilityId) => {
        const decision = { type: 'use_ability' as const, abilityId }
        expect(parseAbilityCommand(decision)).toEqual(decision)
        expect(parseAgentDecision(decision)).toEqual(decision)
        expect(parseNpcAiReply(npcReply(decision))).toMatchObject({ decision })
    }
)

it('limits untargeted model attacks to the five declared blade techniques', () => {
    const schema = decisionSchema as {
        properties: {
            decision: {
                anyOf: Array<{
                    properties?: {
                        type?: { enum: string[] }
                        abilityId?: { enum: string[] }
                    }
                }>
            }
        }
    }
    const branch = schema.properties.decision.anyOf.find(
        (entry) => entry.properties?.type?.enum.includes('use_ability') === true
    )
    expect(branch?.properties?.abilityId?.enum).toEqual([...bladeAbilityIds])
    expect(() =>
        parseNpcAiReply(npcReply({ type: 'use_ability', abilityId: 'spark' }))
    ).toThrow('Invalid NPC AI reply')
    expect(
        parseAgentDecision({
            type: 'use_ability',
            abilityId: 'imagined_technique',
        })
    ).toBeUndefined()
})

it('allows a targeted basic shot only if known and permitted by the NPC', () => {
    const bran = actor('npc_veteran_1')
    const decision = {
        type: 'use_ability' as const,
        abilityId: 'shot' as const,
        targetId: 'visible-slime',
    }
    expect(parseNpcAiReply(npcReply(decision)).decision).toEqual(decision)
    expect(npcAiDecisionError(bran, 'companion', decision)).toContain(
        'not been learned'
    )
    bran.abilities.known.add('shot')
    expect(npcAiDecisionError(bran, 'companion', decision)).toBeUndefined()
    expect(
        npcAiDecisionError(bran, 'companion', {
            type: 'use_ability',
            abilityId: 'shot',
        })
    ).toContain('visible opponent')
})

it('exposes the intention only for an earned and permitted capability while preserving peaceful profiles', () => {
    const sentry = actor()
    const decision = {
        type: 'use_ability' as const,
        abilityId: 'wide_swing' as const,
    }
    expect(npcAiDecisionError(sentry, 'companion', decision)).toContain(
        'not been learned'
    )
    expect(
        npcAiCapabilities('companion', [], null, sentry).intentions
    ).not.toContain('use_ability')
    sentry.abilities.known.add('wide_swing')
    expect(npcAiDecisionError(sentry, 'companion', decision)).toBeUndefined()
    expect(
        npcAiCapabilities('companion', [], null, sentry).intentions
    ).toContain('use_ability')
    const kaplya = actor('npc_magic_slime_1')
    kaplya.abilities.known.add('wide_swing')
    expect(npcAiDecisionError(kaplya, 'companion', decision)).toContain(
        'refuses combat'
    )
    expect(npcAiDecisionError(sentry, 'advisor', decision)).toContain('advisor')
    expect(
        npcAiCapabilities('advisor', [], null, sentry).intentions
    ).not.toContain('use_ability')
})

it('lets an actor leave its held guard despite action occupation, but not while stunned', () => {
    const sentry = actor()
    sentry.abilities.known.add('defensive_stance')
    sentry.combat.defensiveStance = true
    sentry.combat.readyAt = 5000
    const requestAbility = vi.fn<NonNullable<CompanionWorld['requestAbility']>>(
        () => [{ kind: 'status', actorId: sentry.id }]
    )
    const world: CompanionWorld = {
        requestAbility,
        getCharacter: () => undefined,
        findVisibleTarget: () => undefined,
        navigationFor: () => {
            throw new Error('No navigation expected in guard adapter test')
        },
        requestAttack: () => undefined,
    }
    const decision = {
        type: 'use_ability' as const,
        abilityId: 'defensive_stance' as const,
    }
    expect(applyAgentAbility(sentry, decision, world, 1000).accepted).toBe(true)
    expect(requestAbility).toHaveBeenCalledOnce()
    sentry.stunUntil = 2000
    expect(applyAgentAbility(sentry, decision, world, 1000).accepted).toBe(
        false
    )
    expect(requestAbility).toHaveBeenCalledOnce()
})
