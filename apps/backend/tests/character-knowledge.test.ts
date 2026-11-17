import { afterEach, beforeEach, expect, it, vi } from 'vitest'
beforeEach(() => vi.stubGlobal('Bun', { env: {} }))
afterEach(() => vi.unstubAllGlobals())

import {
    CharacterKnowledge,
    characterKnowledge,
} from '../src/ai/characterKnowledge'
import { CharacterMemory } from '../src/ai/characterMemory'
import { SemanticIndex } from '../src/ai/localEmbeddings'
import { snapshotConstellations } from '../src/game/constellationSnapshot'
import { GameRoom } from '../src/game/room'

it('gives Mira common local lore and a cleric only their own revealed constellation details', () => {
    const room = new GameRoom()
    try {
        const mira = room.getCharacter('npc_friendly_girl_1')
        const cleric = room.getCharacter('npc_cleric_1')
        if (mira === undefined || cleric === undefined) {
            throw new Error('Missing authored NPC')
        }
        const general = characterKnowledge(mira, room.navigationFor(mira))
        const doctrine = characterKnowledge(cleric, room.navigationFor(cleric))
        expect(general.some((entry) => entry.group === 'city.local')).toBe(true)
        expect(general.some((entry) => entry.group === 'prayer.doctrine')).toBe(
            false
        )
        expect(
            doctrine.some((entry) => entry.group === 'prayer.doctrine')
        ).toBe(true)
        const known = snapshotConstellations(cleric)
            .nodes.filter((node) => node.unlocked)
            .map((node) => node.id)
        for (const entry of doctrine.filter(
            (entry) => entry.group === 'personal.discovered'
        )) {
            expect(known).toContain(entry.id.split(':').at(-1))
        }
        expect(JSON.stringify(doctrine)).not.toContain('edgeWaypoints')
        expect(
            general.some(
                (entry) =>
                    entry.id === 'service-home:npc_cleric_1' &&
                    entry.text.includes('Часовня')
            )
        ).toBe(true)
        mira.locationId = 'map-2-1'
        const travelled = characterKnowledge(mira, room.navigationFor(mira))
        expect(
            travelled.some((entry) => entry.id === 'service-home:npc_cleric_1')
        ).toBe(true)
        expect(
            travelled.some(
                (entry) =>
                    entry.buildingId !== undefined &&
                    entry.locationId !== mira.locationId
            )
        ).toBe(true)
    } finally {
        room.stop()
    }
})
it('ranks semantic passages only among the keys permitted by the caller', async () => {
    const provider = {
        embed: (texts: string[]) =>
            Promise.resolve(
                texts.map((text) => (text.includes('север') ? [1, 0] : [0, 1]))
            ),
    }
    const index = new SemanticIndex(provider)
    index.remember('north', 'северная дорога')
    index.remember('secret', 'северный секрет другого NPC')
    index.remember('south', 'южная дорога')
    const ranked = await index.rank('север', ['north', 'south'])
    expect(ranked.get('north')).toBe(1)
    expect(ranked.get('south')).toBe(0)
    expect(ranked.has('secret')).toBe(false)
})
it('retrieves a known offline person from only the owning NPC memory', async () => {
    const room = new GameRoom()
    const provider = {
        embed: (texts: string[]) => Promise.resolve(texts.map(() => [1, 0])),
    }
    const knowledge = new CharacterKnowledge(provider)
    try {
        const memory = new CharacterMemory('npc')
        memory.remember({
            id: 'private-1',
            senderId: 'offline-person',
            senderName: 'Саша',
            text: 'Ищу северную заставу',
            channel: 'whisper',
            source: 'heard',
            at: 1,
            locationId: 'map-2-2',
        })
        expect(
            (await knowledge.deep(memory, 'offline-person', 'застава'))
                .messages?.[0]?.id
        ).toBe('private-1')
        expect(
            await knowledge.deep(
                new CharacterMemory('other'),
                'offline-person',
                'застава'
            )
        ).toEqual({ personId: 'offline-person', status: 'not_known' })
    } finally {
        knowledge.stop()
        room.stop()
    }
})

it('restarts a deferred identical indexing key after a transient batch failure', async () => {
    let calls = 0
    const index = new SemanticIndex({
        embed: (texts) => {
            calls += 1
            return calls === 1
                ? Promise.reject(new Error('temporary'))
                : Promise.resolve(texts.map(() => [1, 0]))
        },
    })
    for (let count = 0; count < 40; count++) {
        index.remember(`entry-${String(count)}`, 'Та же память')
    }
    await index.idle()
    index.remember('entry-39', 'Та же память')
    const scores = await index.rank('память', ['entry-39'])
    expect(scores.get('entry-39')).toBe(1)
})
