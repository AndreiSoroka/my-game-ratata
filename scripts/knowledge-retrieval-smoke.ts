import assert from 'node:assert/strict'

import {
    CharacterKnowledge,
    characterKnowledge,
    type KnowledgeResult,
} from '../apps/backend/src/ai/characterKnowledge'
import { CharacterMemory } from '../apps/backend/src/ai/characterMemory'
import { knowledgeSearchText } from '../apps/backend/src/ai/knowledgeSelection'
import { LocalEmbeddings } from '../apps/backend/src/ai/localEmbeddings'
import { GameRoom } from '../apps/backend/src/game/room'

// A fresh room has no model provider or AI coordinator. Only the local embedding
// subprocess is used; no paid inference, controls or live player state are needed.
const room = new GameRoom()
const actorIds = [
    'npc_friendly_girl_1',
    'npc_cleric_1',
    'npc_magic_slime_1',
    'npc_lumberjack_1',
] as const
const authoredTexts = new Set(
    actorIds.flatMap((id) => {
        const actor = room.getCharacter(id)
        assert.ok(actor)
        return characterKnowledge(actor, room.navigationFor(actor))
            .filter((entry) => entry.source.startsWith('authored:'))
            .map((entry) => knowledgeSearchText(entry).slice(0, 1800))
    })
)
const native = new LocalEmbeddings()
let authoredPassageEmbeddings = 0
let queryEmbeddings = 0
const search = new CharacterKnowledge({
    embed: (texts, query) => {
        if (query === true) {
            queryEmbeddings += texts.length
        } else {
            authoredPassageEmbeddings += texts.filter((text) =>
                authoredTexts.has(text)
            ).length
        }
        return native.embed(texts, query)
    },
    persistentCache: () => native.persistentCache(),
    stop: () => native.stop(),
})
const rows: Array<{ actorId: string; query: string; entries: string[] }> = []

function checkBounds(
    result: KnowledgeResult,
    actorId: string,
    allowed: Set<string>
): void {
    assert.ok(result.entries.length <= 6, `${actorId}: too many passages`)
    assert.ok(
        result.entries.reduce((sum, entry) => sum + entry.text.length, 0) <=
            4_000,
        `${actorId}: knowledge context exceeds its budget`
    )
    for (const entry of result.entries) {
        assert.ok(allowed.has(entry.id), `${actorId}: unauthorized ${entry.id}`)
        assert.ok(
            !entry.id.startsWith('own-star:') ||
                entry.id.startsWith(`own-star:${actorId}:`),
            `${actorId}: a foreign personal star leaked`
        )
    }
    assert.doesNotMatch(
        JSON.stringify(result.entries),
        /knowledge\/|"aliases"|"extends"|"audiences"|"checks"|"sources"|"facts"/u
    )
}

function checkTopics(
    result: KnowledgeResult,
    actorId: string,
    query: string
): void {
    const ids = new Set(result.entries.map(({ id }) => id))
    const normalized = query.toLocaleLowerCase()
    if (normalized.includes('дерево') || normalized.includes('дерева')) {
        assert.ok(
            ids.has('forestry.chopping'),
            `${actorId}: missing tree explanation`
        )
        assert.equal(
            ids.has('forestry.chopping.expert'),
            actorId === 'npc_lumberjack_1',
            `${actorId}: incorrect professional knowledge`
        )
        assert.ok(
            [...ids].every((id) => id.startsWith('forestry.')),
            `${actorId}: unrelated woodcutting topic`
        )
    } else if (normalized.includes('капля')) {
        assert.equal(
            ids.has('person.kaplya'),
            actorId === 'npc_magic_slime_1',
            `${actorId}: incorrect personal grant`
        )
    } else if (normalized.includes('игната')) {
        assert.ok(
            ids.has('city.ignat'),
            `${actorId}: missing smith explanation`
        )
        assert.ok(
            ids.has('service-catalog:npc_smith_1'),
            `${actorId}: missing authored workshop catalogue`
        )
        assert.ok(
            [...ids].every(
                (id) => id === 'city.ignat' || id.endsWith(':npc_smith_1')
            ),
            `${actorId}: unrelated merchant topic`
        )
    } else {
        assert.ok(
            ids.has('life.purification'),
            `${actorId}: missing grave explanation`
        )
        assert.ok(
            actorId === 'npc_cleric_1' || !ids.has('faith.mother'),
            `${actorId}: incorrect doctrine grant`
        )
    }
}

try {
    for (const actorId of actorIds) {
        const actor = room.getCharacter(actorId)
        assert.ok(actor, `Missing authored actor ${actorId}`)
        const navigation = room.navigationFor(actor)
        const allowed = new Set(
            characterKnowledge(actor, navigation).map(({ id }) => id)
        )
        const memory = new CharacterMemory(actor.id)
        for (const query of [
            'Как срубить дерево?',
            'Сколько древесины выйдет с дерева?',
            'Сколько древесины и саженцев можно получить с одного дерева',
            'Сколько древесины и саженцев дают взрослое и малое дерево при рубке',
            'Почему Капля не сражается?',
            'У Игната сейчас точно есть топор? Сколько он стоит?',
            'у игната есть топор? сколько он стоит?',
            'Как упокоить могилу?',
        ]) {
            const result = await search.retrieve(
                actor,
                navigation,
                memory,
                query
            )
            checkBounds(result, actorId, allowed)
            checkTopics(result, actorId, query)
            rows.push({
                actorId,
                query,
                entries: result.entries.map(({ id }) => id),
            })
        }
    }
    console.info(
        JSON.stringify({
            actors: actorIds.length,
            queries: rows.length,
            unauthorized: 0,
            authoredPassageEmbeddings,
            queryEmbeddings,
            localOnly: true,
            results: rows,
        })
    )
} finally {
    search.stop()
    room.stop()
}
