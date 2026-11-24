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

it('lets Novogorod residents look up the necromancer rumor without confusing Savva with the merchant', async () => {
    const room = new GameRoom()
    const search = new CharacterKnowledge(
        { embed: (texts) => Promise.resolve(texts.map(() => [1, 0])) },
        () => undefined
    )
    try {
        const mira = room.getCharacter('npc_friendly_girl_1')
        const savva = room.getCharacter('npc_necromancer_1')
        if (mira === undefined || savva === undefined) {
            throw new Error('Missing authored NPC')
        }
        const retrieve = (actor: typeof mira, query: string) =>
            search.retrieve(
                actor,
                room.navigationFor(actor),
                new CharacterMemory(actor.id),
                query
            )
        const rumorId = 'city.necromancer.rumor'
        const rumorQuery = 'Что слышно о некроманте Савве?'
        const localRumor = await retrieve(mira, rumorQuery)
        expect(localRumor.entries[0]?.id).toBe(rumorId)
        expect(localRumor.entries[0]?.text).toContain('прогнать из этих земель')
        expect(
            (await retrieve(savva, rumorQuery)).entries.map(({ id }) => id)
        ).not.toContain(rumorId)
        const merchant = await retrieve(mira, 'Где Савва продаёт припасы?')
        const merchantIds = merchant.entries.map(({ id }) => id)
        expect(merchantIds).toContain('city.savva')
        expect(merchantIds).not.toContain(rumorId)
    } finally {
        search.stop()
        room.stop()
    }
})
