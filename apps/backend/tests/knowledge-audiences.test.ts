import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import {
    characterKnowledgeAudiences,
    hasKnowledgeAudience,
    isKnowledgeAudience,
    knowledgeResidenceIds,
    setKnowledgeResidences,
} from '../src/ai/knowledgeAudiences'
import { GameCharacter } from '../src/game/character'
import type { GameCharacterOptions } from '../src/game/characterIdentity'
import { GameRoom } from '../src/game/room'

beforeEach(() => vi.stubGlobal('Bun', { env: {} }))
afterEach(() => vi.unstubAllGlobals())

function character(options: Partial<GameCharacterOptions> = {}): GameCharacter {
    return new GameCharacter({
        id: 'visitor',
        nickname: 'Капля',
        archetype: 'human',
        controllerKind: 'scripted',
        spawnPosition: { x: 32, y: 32 },
        ...options,
    })
}

it('validates closed audience registries instead of accepting guessed groups', () => {
    for (const audience of [
        'common',
        'creature:humanoid',
        'archetype:slime',
        'profession:lumberjack',
        'doctrine:prayer',
        `resident:${CENTER_LOCATION_ID}`,
        'character:npc_magic_slime_1',
        'knows:pray',
    ]) {
        expect(isKnowledgeAudience(audience), audience).toBe(true)
    }
    for (const audience of [
        '',
        'unknown',
        'profession:woodcutter',
        'creature:slime',
        'knows:secret_spell',
        'resident:map-8-8',
        'character:invented',
    ]) {
        expect(isKnowledgeAudience(audience), audience).toBe(false)
    }
})

it('uses authoritative creature type, archetype and identity, never name or sprite', () => {
    const slime = character({
        id: 'npc_magic_slime_1',
        archetype: 'slime',
        visualId: 'player',
    })
    const human = character({ nickname: slime.nickname, visualId: 'slime' })
    const slimeAudiences = characterKnowledgeAudiences(slime)
    expect(slimeAudiences.has('creature:ooze')).toBe(true)
    expect(slimeAudiences.has('archetype:slime')).toBe(true)
    expect(slimeAudiences.has('character:npc_magic_slime_1')).toBe(true)
    const humanAudiences = characterKnowledgeAudiences(human)
    expect(humanAudiences.has('creature:humanoid')).toBe(true)
    expect(humanAudiences.has('archetype:slime')).toBe(false)
    expect(humanAudiences.has('character:npc_magic_slime_1')).toBe(false)
})

it('unions audiences with explicit AND clauses for local professional knowledge', () => {
    const lumberjack = character()
    lumberjack.tags.add('worker.lumberjack')
    expect(
        hasKnowledgeAudience(characterKnowledgeAudiences(lumberjack), [
            ['profession:lumberjack', `resident:${CENTER_LOCATION_ID}`],
        ])
    ).toBe(false)
    lumberjack.tags.add(`worker.city.${CENTER_LOCATION_ID}`)
    const audiences = characterKnowledgeAudiences(lumberjack)
    expect(
        hasKnowledgeAudience(audiences, [
            ['profession:lumberjack', `resident:${CENTER_LOCATION_ID}`],
        ])
    ).toBe(true)
    expect(
        hasKnowledgeAudience(audiences, [
            'creature:ooze',
            ['profession:lumberjack', `resident:${CENTER_LOCATION_ID}`],
        ])
    ).toBe(true)
    lumberjack.tags.delete('worker.lumberjack')
    expect(
        hasKnowledgeAudience(characterKnowledgeAudiences(lumberjack), [
            'profession:lumberjack',
        ])
    ).toBe(false)
})

it('does not grant city knowledge to visitors born there or change residence on travel', () => {
    const visitor = character({ locationId: CENTER_LOCATION_ID })
    expect(knowledgeResidenceIds(visitor)).toEqual([])
    visitor.locationId = 'map-2-1'
    expect(knowledgeResidenceIds(visitor)).toEqual([])
    const companion = character({
        id: 'new_companion_without_authored_home',
        nickname: 'Попутчик',
    })
    companion.soul.companion = {
        canFight: false,
        lastReply: null,
        leaderId: visitor.id,
        order: 'follow',
    }
    expect(knowledgeResidenceIds(companion)).toEqual([])
    const local = character({ id: 'npc_friendly_girl_1' })
    local.locationId = 'map-2-1'
    expect(knowledgeResidenceIds(local)).toEqual([CENTER_LOCATION_ID])
    setKnowledgeResidences(local, [])
    expect(knowledgeResidenceIds(local)).toEqual([])
    expect(() => setKnowledgeResidences(local, ['map-9-9'])).toThrow(/Unknown/u)
})

it('keeps Spark and ownership separate from knowledge and checks actually learned abilities', () => {
    const echo = character()
    const before = characterKnowledgeAudiences(echo)
    echo.soul.kind = 'spark'
    echo.soul.controlSource = 'model'
    expect(characterKnowledgeAudiences(echo)).toEqual(before)
    const cleric = character({ heroClass: 'cleric' })
    expect(characterKnowledgeAudiences(cleric).has('doctrine:prayer')).toBe(
        true
    )
    cleric.abilities.known.clear()
    expect(characterKnowledgeAudiences(cleric).has('doctrine:prayer')).toBe(
        false
    )
    echo.abilities.known.add('spark')
    expect(characterKnowledgeAudiences(echo).has('doctrine:magic')).toBe(true)
    expect(characterKnowledgeAudiences(echo).has('knows:spark')).toBe(true)
})

it('projects real authored services, workers and clergy into their knowledge audiences', () => {
    const room = new GameRoom()
    try {
        const expected: Record<string, string[]> = {
            npc_smith_1: ['profession:smith'],
            npc_lumberjack_1: ['profession:lumberjack'],
            npc_cleric_1: ['doctrine:prayer', 'knows:pray'],
            npc_scholar_1: ['doctrine:magic'],
        }
        for (const [id, grants] of Object.entries(expected)) {
            const actor = room.getCharacter(id)
            expect(actor, id).toBeDefined()
            if (actor !== undefined) {
                const audiences = characterKnowledgeAudiences(actor)
                for (const grant of [
                    ...grants,
                    `resident:${CENTER_LOCATION_ID}`,
                ]) {
                    expect(audiences.has(grant), `${id}: ${grant}`).toBe(true)
                }
            }
        }
    } finally {
        room.stop()
    }
})
