import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { characterKnowledgeAudiences } from '../src/ai/knowledgeAudiences'
import { actorRefusesCombat } from '../src/game/agentCapabilities'
import { GameCharacter } from '../src/game/character'
import { restoreCharacter } from '../src/game/characterRecovery'
import { setCharacterControlSource } from '../src/game/characterSoul'
import { companionProfiles, companionSoul } from '../src/game/companionProfiles'
import {
    type NpcIdentityDefinition,
    npcIdentityDefinitions,
    type NpcIdentityKey,
} from '../src/game/npcIdentityCatalog'
import {
    generateNpcIdentityProfile,
    initializeNpcIdentityProfiles,
    NPC_IDENTITY_GENERATION_VERSION,
    resolveNpcIdentitySeed,
    validateNpcIdentityDefinition,
} from '../src/game/npcIdentityProfiles'
import { GameRoom } from '../src/game/room'
import { joinScenarioRoom } from './scenarioRoomHelpers'

beforeEach(() => vi.stubGlobal('Bun', { env: {} }))
afterEach(() => vi.unstubAllGlobals())

const ids = {
    mira: 'npc_friendly_girl_1',
    kaplya: 'npc_magic_slime_1',
    vera: 'npc_cleric_1',
} as const
const keys: NpcIdentityKey[] = ['mira', 'kaplya', 'vera']

function actor(
    id: string,
    key?: NpcIdentityKey,
    options: { human?: boolean; silent?: boolean; nickname?: string } = {}
): GameCharacter {
    return new GameCharacter({
        id,
        nickname: options.nickname ?? id,
        archetype: key === 'kaplya' ? 'slime' : 'human',
        controllerKind: options.human === true ? 'network_player' : 'scripted',
        faction: 'peaceful',
        spawnPosition: { x: 80, y: 80 },
        ...(key === undefined ? {} : { npcIdentityKey: key }),
        soul: {
            ...companionSoul(id),
            ...(options.silent === true ? { canSpeak: false } : {}),
        },
    })
}

describe('authored NPC identity catalogue', () => {
    it('supplies explicit sex and grammatical self-reference independently of a name or species', () => {
        expect(npcIdentityDefinitions.mira).toMatchObject({
            gender: 'female',
            selfReference: 'feminine',
        })
        expect(npcIdentityDefinitions.vera).toMatchObject({
            gender: 'female',
            selfReference: 'feminine',
        })
        expect(npcIdentityDefinitions.kaplya).toMatchObject({
            gender: 'sexless',
            selfReference: 'neuter',
        })
        const original = generateNpcIdentityProfile(
            'same-life',
            ids.kaplya,
            'kaplya'
        )
        const changed = generateNpcIdentityProfile(
            'same-life',
            ids.kaplya,
            'kaplya',
            {
                ...npcIdentityDefinitions.kaplya,
                gender: 'male',
                selfReference: 'masculine',
            }
        )
        expect(changed.gender).toBe('male')
        expect(changed.selfReference).toBe('masculine')
        expect(changed.backstory.id).toBe(original.backstory.id)
        expect(changed.version).toBe(original.version)
    })

    it('contains exactly five short, distinct histories for each of the three profiles', () => {
        expect(Object.keys(npcIdentityDefinitions).sort()).toEqual(
            [...keys].sort()
        )
        for (const key of keys) {
            const definition = npcIdentityDefinitions[key]
            expect(() =>
                validateNpcIdentityDefinition(definition)
            ).not.toThrow()
            expect(definition.key).toBe(key)
            expect(definition.backstories).toHaveLength(5)
            expect(
                new Set(definition.backstories.map(({ id }) => id)).size
            ).toBe(5)
            expect(
                new Set(definition.backstories.map(({ text }) => text)).size
            ).toBe(5)
            for (const story of definition.backstories) {
                expect(story.id).toMatch(/^[a-z][a-z0-9_]*$/u)
                expect(story.title.trim().length).toBeGreaterThan(0)
                expect(story.text.length).toBeLessThanOrEqual(450)
                const sentences = story.text.match(/[^.!?]+[.!?]/gu) ?? []
                expect(sentences.length).toBeGreaterThanOrEqual(2)
                expect(sentences.length).toBeLessThanOrEqual(3)
            }
        }
    })

    it('rejects malformed or ambiguous definitions rather than choosing a silent fallback', () => {
        const definition = npcIdentityDefinitions.mira
        const first = definition.backstories[0]
        if (first === undefined) {
            throw new Error('Missing authored history')
        }
        const malformed: NpcIdentityDefinition[] = [
            { ...definition, name: '' },
            { ...definition, description: '' },
            { ...definition, responsibilities: [] },
            { ...definition, backstories: [] },
            { ...definition, backstories: [first, first] },
            { ...definition, backstories: [{ ...first, id: '' }] },
            { ...definition, backstories: [{ ...first, title: '' }] },
            { ...definition, backstories: [{ ...first, text: '' }] },
            {
                ...definition,
                backstories: [{ ...first, text: 'x'.repeat(451) }],
            },
        ]
        for (const invalid of malformed) {
            expect(() => validateNpcIdentityDefinition(invalid)).toThrow()
        }
    })
})

describe('deterministic identity generation', () => {
    it.each(keys)(
        'depends on stable identity and seed, not variant ordering for %s',
        (key) => {
            const definition = npcIdentityDefinitions[key]
            const expected = generateNpcIdentityProfile(
                'world-a',
                ids[key],
                key
            )
            expect(expected.version).toBe(NPC_IDENTITY_GENERATION_VERSION)
            expect(expected.key).toBe(key)
            expect(expected.name).toBe(definition.name)
            expect(expected.description).toBe(definition.description)
            expect(expected.responsibilities).toEqual(
                definition.responsibilities
            )
            expect(
                generateNpcIdentityProfile('world-a', ids[key], key)
            ).toEqual(expected)
            expect(
                generateNpcIdentityProfile('world-a', ids[key], key, {
                    ...definition,
                    backstories: [...definition.backstories].reverse(),
                })
            ).toEqual(expected)
            const identities = new Set(
                Array.from(
                    { length: 16 },
                    (_, index) =>
                        generateNpcIdentityProfile(
                            'world-a',
                            `new-life-${String(index)}`,
                            key
                        ).backstory.id
                )
            )
            expect(identities.size).toBeGreaterThan(1)
        }
    )

    it.each(keys)(
        'can select all five approved %s histories across world seeds',
        (key) => {
            const selected = new Set(
                Array.from(
                    { length: 256 },
                    (_, index) =>
                        generateNpcIdentityProfile(
                            `world-${String(index)}`,
                            ids[key],
                            key
                        ).backstory.id
                )
            )
            expect([...selected].sort()).toEqual(
                npcIdentityDefinitions[key].backstories
                    .map(({ id }) => id)
                    .sort()
            )
        }
    )

    it('validates seeds and requires a real stable character identity', () => {
        for (const seed of ['', '   ', '\0', 'x'.repeat(257)]) {
            expect(() => resolveNpcIdentitySeed(seed)).toThrow()
            expect(() =>
                generateNpcIdentityProfile(seed, ids.mira, 'mira')
            ).toThrow()
        }
        expect(resolveNpcIdentitySeed('repeatable-world')).toBe(
            'repeatable-world'
        )
        expect(resolveNpcIdentitySeed()).not.toBe(resolveNpcIdentitySeed())
        expect(() =>
            generateNpcIdentityProfile('world-a', '   ', 'mira')
        ).toThrow()
    })
})

describe('NPC identity assignment boundaries', () => {
    it('uses explicit authored keys, never names or familiar actor IDs', () => {
        const impostor = actor('human-namesake', 'mira', {
            human: true,
            nickname: 'Мира',
        })
        const familiarId = actor(ids.mira)
        const familiarName = actor('ordinary-resident', undefined, {
            nickname: 'Мира',
        })
        const silent = actor('silent-authored-actor', 'kaplya', {
            silent: true,
        })
        const authored = actor('different-stable-id', 'mira', {
            nickname: 'Другое имя',
        })
        initializeNpcIdentityProfiles(
            [impostor, familiarId, familiarName, silent, authored],
            'world-a'
        )
        for (const skipped of [impostor, familiarId, familiarName, silent]) {
            expect(skipped.npcIdentityProfile).toBeUndefined()
        }
        expect(authored.npcIdentityProfile).toEqual(
            generateNpcIdentityProfile('world-a', authored.id, 'mira')
        )
    })

    it('is independent of spawning order and adding unrelated actors', () => {
        const first = keys.map((key) => actor(ids[key], key))
        const second = [...keys].reverse().map((key) => actor(ids[key], key))
        second.push(actor('unrelated-resident'))
        initializeNpcIdentityProfiles(first, 'world-a')
        initializeNpcIdentityProfiles(second, 'world-a')
        for (const original of first) {
            expect(
                second.find(({ id }) => id === original.id)?.npcIdentityProfile
            ).toEqual(original.npcIdentityProfile)
        }
    })

    it('keeps the entire selected profile immutable and outside public snapshots', () => {
        const kaplya = actor(ids.kaplya, 'kaplya')
        const before = kaplya.snapshot(1000)
        initializeNpcIdentityProfiles([kaplya], 'world-a')
        const selected = kaplya.npcIdentityProfile
        expect(selected).toBeDefined()
        expect(Object.isFrozen(selected)).toBe(true)
        expect(Object.isFrozen(selected?.responsibilities)).toBe(true)
        expect(Object.isFrozen(selected?.backstory)).toBe(true)
        expect(Object.keys(kaplya)).not.toContain('npcIdentityProfile')
        expect(Object.keys(kaplya)).not.toContain('npcIdentityKey')
        expect(Reflect.set(kaplya, 'npcIdentityKey', 'mira')).toBe(false)
        expect(
            Reflect.set(
                kaplya,
                'npcIdentityProfile',
                generateNpcIdentityProfile('world-b', kaplya.id, 'kaplya')
            )
        ).toBe(false)
        expect(kaplya.snapshot(1000)).toEqual(before)
        const publicJson = JSON.stringify(kaplya.snapshot(1000))
        expect(publicJson).not.toContain('npcIdentity')
        for (const definition of Object.values(npcIdentityDefinitions)) {
            for (const story of definition.backstories) {
                expect(publicJson).not.toContain(story.text)
            }
        }
    })
})

describe('identity lifetime and gameplay authority', () => {
    it('does not grant abilities or knowledge, and survives control changes and resurrection', () => {
        const kaplya = actor(ids.kaplya, 'kaplya')
        const known = new Set(kaplya.abilities.known)
        const audiences = characterKnowledgeAudiences(kaplya)
        const personality = kaplya.soul.personality
        initializeNpcIdentityProfiles([kaplya], 'world-a')
        const selected = kaplya.npcIdentityProfile
        expect(kaplya.abilities.known).toEqual(known)
        expect(characterKnowledgeAudiences(kaplya)).toEqual(audiences)
        expect(kaplya.soul.personality).toBe(personality)
        expect(actorRefusesCombat(kaplya)).toBe(true)
        expect(companionProfiles[kaplya.id]?.canFollow).toBe(true)
        for (const source of ['model', 'human', 'script'] as const) {
            setCharacterControlSource(kaplya, source)
            initializeNpcIdentityProfiles([kaplya], 'different-world-seed')
            expect(kaplya.npcIdentityProfile).toBe(selected)
        }
        kaplya.applyDamage(100_000, 2000)
        expect(kaplya.alive).toBe(false)
        restoreCharacter(kaplya, 7000, false)
        initializeNpcIdentityProfiles([kaplya], 'different-world-seed')
        expect(kaplya.alive).toBe(true)
        expect(kaplya.npcIdentityProfile).toBe(selected)
        expect(actorRefusesCombat(kaplya)).toBe(true)
    })

    it('creates a separate profile for a new identity instead of inheriting a namesake', () => {
        const oldPerson = actor('old-mira-life', 'mira', { nickname: 'Мира' })
        const newPerson = actor('new-mira-life', 'mira', { nickname: 'Мира' })
        initializeNpcIdentityProfiles([oldPerson, newPerson], 'world-a')
        expect(newPerson.npcIdentityProfile).toEqual(
            generateNpcIdentityProfile('world-a', newPerson.id, 'mira')
        )
        expect(newPerson.npcIdentityProfile).not.toBe(
            oldPerson.npcIdentityProfile
        )
    })
})

describe('room-level identity and speech independence', () => {
    it('prepares only the three authored NPCs before model control without touching human biographies', () => {
        const room = new GameRoom(undefined, {
            npcIdentitySeed: 'identity-world',
            npcSpeechSeed: 'speech-world',
        })
        try {
            for (const key of keys) {
                const character = room.getCharacter(ids[key])
                expect(character?.npcIdentityKey).toBe(key)
                expect(character?.npcIdentityProfile).toEqual(
                    generateNpcIdentityProfile('identity-world', ids[key], key)
                )
            }
            for (const id of [
                'npc_princess_1',
                'npc_veteran_1',
                'npc_lumberjack_1',
            ]) {
                expect(room.getCharacter(id)).toBeDefined()
                expect(
                    room.getCharacter(id)?.npcIdentityProfile
                ).toBeUndefined()
            }
            const human = joinScenarioRoom(room, 'Мира')
            expect(human.actor.npcIdentityProfile).toBeUndefined()
            expect(human.actor.npcIdentityKey).toBeUndefined()
            expect(companionProfiles[ids.mira]?.canFight).toBe(false)
            expect(companionProfiles[ids.mira]?.canFollow).toBe(false)
        } finally {
            room.stop()
        }
    })

    it('uses an independent seed stream for biography and speech', () => {
        const rooms = [
            new GameRoom(undefined, {
                npcIdentitySeed: 'identity-a',
                npcSpeechSeed: 'speech-a',
            }),
            new GameRoom(undefined, {
                npcIdentitySeed: 'identity-a',
                npcSpeechSeed: 'speech-b',
            }),
            new GameRoom(undefined, {
                npcIdentitySeed: 'identity-b',
                npcSpeechSeed: 'speech-a',
            }),
        ]
        try {
            const [first, changedSpeech, changedIdentity] = rooms
            if (
                first === undefined ||
                changedSpeech === undefined ||
                changedIdentity === undefined
            ) {
                throw new Error('Missing test rooms')
            }
            for (const id of Object.values(ids)) {
                expect(first.getCharacter(id)?.npcIdentityProfile).toEqual(
                    changedSpeech.getCharacter(id)?.npcIdentityProfile
                )
                expect(first.getCharacter(id)?.npcSpeechProfile).toEqual(
                    changedIdentity.getCharacter(id)?.npcSpeechProfile
                )
            }
        } finally {
            rooms.forEach((room) => room.stop())
        }
    })
})
