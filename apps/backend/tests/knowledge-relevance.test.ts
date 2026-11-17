import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import {
    CharacterKnowledge,
    characterKnowledge,
} from '../src/ai/characterKnowledge'
import { CharacterMemory } from '../src/ai/characterMemory'
import { lexicalKnowledgeScore } from '../src/ai/knowledgeSelection'
import { GameRoom } from '../src/game/room'

beforeEach(() => vi.stubGlobal('Bun', { env: {} }))
afterEach(() => vi.unstubAllGlobals())

it.each([
    'Сколько древесины и саженцев можно получить с одного дерева',
    'Сколько древесины и саженцев дают взрослое и малое дерево при рубке',
])('keeps a model-reformulated yield search on forestry: %s', async (query) => {
    const room = new GameRoom()
    const search = new CharacterKnowledge(
        { embed: (texts) => Promise.resolve(texts.map(() => [1, 0])) },
        () => undefined
    )
    try {
        for (const id of [
            'npc_friendly_girl_1',
            'npc_cleric_1',
            'npc_magic_slime_1',
            'npc_lumberjack_1',
        ]) {
            const actor = room.getCharacter(id)
            if (actor === undefined) {
                throw new Error(`Missing authored NPC ${id}`)
            }
            const navigation = room.navigationFor(actor)
            const allowed = new Set(
                characterKnowledge(actor, navigation).map((entry) => entry.id)
            )
            const result = await search.retrieve(
                actor,
                navigation,
                new CharacterMemory(id),
                query
            )
            const ids = result.entries.map((entry) => entry.id)
            expect(ids).toContain('forestry.chopping')
            expect(ids.every((key) => key.startsWith('forestry.'))).toBe(true)
            expect(ids.every((key) => allowed.has(key))).toBe(true)
            expect(ids.includes('forestry.chopping.expert')).toBe(
                id === 'npc_lumberjack_1'
            )
            expect(ids.length).toBeLessThanOrEqual(6)
            expect(
                result.entries.reduce(
                    (sum, entry) => sum + entry.text.length,
                    0
                )
            ).toBeLessThanOrEqual(4000)
        }
    } finally {
        search.stop()
        room.stop()
    }
})

it('does not anchor on generic acquisition or cardinal words while preserving work verbs', () => {
    expect(
        lexicalKnowledgeScore(
            'получить одного дают',
            'Из одного обещания нельзя получить награду. Уровни дают открытия.'
        )
    ).toBe(0)
    expect(
        lexicalKnowledgeScore(
            'рубить дерево чинить топор',
            'Можно рубить дерево и чинить топор.'
        )
    ).toBe(4)
})
