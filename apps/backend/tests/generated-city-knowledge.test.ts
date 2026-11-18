import assert from 'node:assert/strict'

import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { CharacterKnowledge } from '../src/ai/characterKnowledge'
import { CharacterMemory } from '../src/ai/characterMemory'
import {
    characterKnowledge,
    roomKnowledgeContext,
} from '../src/ai/knowledgeCatalog'
import type { EmbeddingProvider } from '../src/ai/localEmbeddings'
import { containsBuildingPoint } from '../src/game/mapBuildings'
import { GameRoom } from '../src/game/room'
import { WorldMaps } from '../src/game/worldMaps'

beforeEach(() => vi.stubGlobal('Bun', { env: {} }))
afterEach(() => vi.unstubAllGlobals())

function setup() {
    const maps = new WorldMaps({
        seed: 'knowledge-anchors',
        epoch: 'knowledge-epoch',
    })
    const room = new GameRoom(maps.navigation(CENTER_LOCATION_ID), {
        worldMaps: maps,
        initialBellState: 'silent',
    })
    const mira = room.getCharacter('npc_friendly_girl_1')
    assert(mira !== undefined)
    const catalog = () =>
        characterKnowledge(mira, room.navigation, roomKnowledgeContext(room))
    return { room, mira, catalog }
}

it('adds a conditional resident to the current directory only after shared activation registration', () => {
    const f = setup()
    try {
        expect(f.room.getCharacter('npc_magic_slime_1')).toBeUndefined()
        expect(
            f
                .catalog()
                .some((entry) => entry.id === 'service-home:npc_magic_slime_1')
        ).toBe(false)
        const city = f.room.adventureForWorkers().cities
        expect(city.prepare(CENTER_LOCATION_ID)).toBe(true)
        expect(
            city.activate(CENTER_LOCATION_ID, 'fixture', { x: 0, y: 0 })
        ).toHaveLength(1)
        const kaplya = f.room.getCharacter('npc_magic_slime_1')
        assert(kaplya !== undefined)
        const entries = f.catalog()
        expect(
            entries.some(
                (entry) => entry.id === 'service-home:npc_magic_slime_1'
            )
        ).toBe(true)
        expect(entries.some((entry) => entry.id === 'person.kaplya')).toBe(
            false
        )
        expect(JSON.stringify(entries)).not.toContain(
            kaplya.npcIdentityProfile?.backstory.text
        )
        const chapel = f.room.navigation.grid.buildings?.find((building) =>
            containsBuildingPoint(building.bounds, kaplya.position)
        )
        assert(chapel !== undefined)
        expect(
            entries.find(
                (entry) => entry.id === 'service-home:npc_magic_slime_1'
            )?.buildingId
        ).toBe(chapel.id)
    } finally {
        f.room.stop()
    }
})

it('resolves city service homes from the generated anchors rather than fixed map coordinates', () => {
    const f = setup()
    try {
        const vera = f.room.getCharacter('npc_cleric_1')
        assert(vera !== undefined)
        const chapel = f.room.navigation.grid.buildings?.find((building) =>
            containsBuildingPoint(building.bounds, vera.position)
        )
        assert(chapel !== undefined)
        expect(
            f
                .catalog()
                .find((entry) => entry.id === 'service-home:npc_cleric_1')
        ).toMatchObject({
            buildingId: chapel.id,
            locationId: CENTER_LOCATION_ID,
        })
    } finally {
        f.room.stop()
    }
})

it('rechecks conditional directory access after semantic work and preserves lexical fallback', async () => {
    const f = setup()
    const queried = Promise.withResolvers<undefined>()
    const vector = Promise.withResolvers<number[][]>()
    let exists = true
    const catalog = () =>
        characterKnowledge(f.mira, f.room.navigation, {
            residentExists: () => exists,
        })
    const provider: EmbeddingProvider = {
        embed: (texts, query) => {
            if (query === true) {
                queried.resolve(undefined)
                return vector.promise
            }
            return Promise.resolve(texts.map(() => [1, 0]))
        },
    }
    const knowledge = new CharacterKnowledge(provider, () => undefined, catalog)
    const lexical = new CharacterKnowledge(
        { embed: () => Promise.reject(new Error('offline')) },
        () => undefined,
        catalog
    )
    const memory = new CharacterMemory(f.mira.id)
    try {
        expect(
            catalog().some(
                (entry) => entry.id === 'service-home:npc_magic_slime_1'
            )
        ).toBe(true)
        const pending = knowledge.retrieve(
            f.mira,
            f.room.navigation,
            memory,
            'Капля'
        )
        await queried.promise
        exists = false
        vector.resolve([[1, 0]])
        const result = await pending
        expect(
            result.entries.some(
                (entry) => entry.id === 'service-home:npc_magic_slime_1'
            )
        ).toBe(false)
        const offline = await lexical.retrieve(
            f.mira,
            f.room.navigation,
            memory,
            'Сестра Вера часовня'
        )
        expect(
            offline.entries.some(
                (entry) => entry.id === 'service-home:npc_cleric_1'
            )
        ).toBe(true)
        expect(
            offline.entries.some((entry) => entry.id === 'person.kaplya')
        ).toBe(false)
    } finally {
        knowledge.stop()
        lexical.stop()
        f.room.stop()
    }
})
