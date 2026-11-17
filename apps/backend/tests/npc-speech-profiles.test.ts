import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { defaultNpcAiSettings } from '../src/ai/config'
import { NpcAiDiagnostics } from '../src/ai/diagnostics'
import { NpcAiDialogue } from '../src/ai/dialogue'
import { npcDialogueContext } from '../src/ai/dialogueContext'
import { characterKnowledgeAudiences } from '../src/ai/knowledgeAudiences'
import { npcSpeechContext } from '../src/ai/npcSpeechInstructions'
import { createNpcAiState } from '../src/ai/runtimeState'
import { actorRefusesCombat } from '../src/game/agentCapabilities'
import { GameCharacter } from '../src/game/character'
import { restoreCharacter } from '../src/game/characterRecovery'
import { setCharacterControlSource } from '../src/game/characterSoul'
import { companionProfiles, companionSoul } from '../src/game/companionProfiles'
import { CompanionService } from '../src/game/companions'
import {
    compatibleNpcSpeechTraits,
    npcSpeechToneIds,
    npcSpeechTraitIds,
} from '../src/game/npcSpeechCatalog'
import {
    defaultNpcSpeechPool,
    generateNpcSpeechProfile,
    initializeNpcSpeechProfiles,
    type NpcSpeechPool,
    npcSpeechPool,
    resolveNpcSpeechSeed,
    validateNpcSpeechPool,
} from '../src/game/npcSpeechProfiles'
import { GameRoom } from '../src/game/room'
import { joinScenarioRoom } from './scenarioRoomHelpers'

beforeEach(() => vi.stubGlobal('Bun', { env: {} }))
afterEach(() => vi.unstubAllGlobals())

function actor(id: string, player = false): GameCharacter {
    return new GameCharacter({
        id,
        nickname: id,
        archetype: id === 'npc_magic_slime_1' ? 'slime' : 'human',
        controllerKind: player ? 'network_player' : 'scripted',
        faction: 'peaceful',
        spawnPosition: { x: 80, y: 80 },
        ...(player ? {} : { soul: companionSoul(id) }),
    })
}

describe('deterministic NPC speech selection', () => {
    it('depends on the seed and stable identity, independently from actor and pool ordering', () => {
        const ids = ['npc_friendly_girl_1', 'npc_magic_slime_1', 'npc_cleric_1']
        const selected = new Map(
            ids.map((id) => [id, generateNpcSpeechProfile('region-a', id)])
        )
        for (const id of [...ids].reverse()) {
            expect(generateNpcSpeechProfile('region-a', id)).toEqual(
                selected.get(id)
            )
            const pool = npcSpeechPool(id)
            expect(
                generateNpcSpeechProfile('region-a', id, {
                    ...pool,
                    traits: [...pool.traits].reverse(),
                    tones: [...pool.tones].reverse(),
                })
            ).toEqual(selected.get(id))
        }
        const alternatives = new Set(
            Array.from({ length: 24 }, (_, index) =>
                JSON.stringify(
                    generateNpcSpeechProfile(
                        `region-${String(index)}`,
                        'npc_friendly_girl_1'
                    )
                )
            )
        )
        expect(alternatives.size).toBeGreaterThan(1)
    })

    it('uses every approved Mira trait and tone while excluding incompatible combinations', () => {
        const traits = new Set<string>()
        const tones = new Set<string>()
        const counts = new Set<number>()
        for (let index = 0; index < 256; index += 1) {
            const profile = generateNpcSpeechProfile(
                `world-${String(index)}`,
                'npc_friendly_girl_1'
            )
            expect(compatibleNpcSpeechTraits(profile.traits)).toBe(true)
            expect(new Set(profile.traits).size).toBe(profile.traits.length)
            profile.traits.forEach((id) => traits.add(id))
            tones.add(profile.tone)
            counts.add(profile.traits.length)
        }
        expect([...traits].sort()).toEqual([...npcSpeechTraitIds].sort())
        expect([...tones].sort()).toEqual([...npcSpeechToneIds].sort())
        expect([...counts].sort()).toEqual([1, 2, 3])
    })

    it.each(['npc_magic_slime_1', 'npc_cleric_1', 'npc_smith_1'])(
        'keeps %s inside its authored pool across world seeds',
        (id) => {
            const pool = npcSpeechPool(id)
            for (let index = 0; index < 64; index += 1) {
                const profile = generateNpcSpeechProfile(
                    `world-${String(index)}`,
                    id
                )
                expect(profile.traits.length).toBeGreaterThanOrEqual(
                    pool.minTraits
                )
                expect(profile.traits.length).toBeLessThanOrEqual(
                    pool.maxTraits
                )
                expect(
                    profile.traits.every((trait) => pool.traits.includes(trait))
                ).toBe(true)
                expect(pool.tones).toContain(profile.tone)
            }
        }
    )

    it.each([
        { traits: [] },
        { traits: ['kind', 'kind'] },
        { traits: ['unknown'] },
        { tones: [] },
        { tones: ['gentle', 'gentle'] },
        { tones: ['unknown'] },
        { minTraits: 0 },
        { minTraits: 2, maxTraits: 1 },
        { maxTraits: 4 },
        { minTraits: 1.5 },
        { traits: ['direct', 'sly'], minTraits: 2, maxTraits: 2 },
    ])('rejects invalid or impossible pool %j', (change) => {
        expect(() =>
            validateNpcSpeechPool({
                ...defaultNpcSpeechPool,
                ...change,
            } as NpcSpeechPool)
        ).toThrow('Invalid NPC speech pool')
    })

    it('validates explicit seeds and provides a new seed for a new unseeded world', () => {
        for (const seed of ['', '   ', '\0', 'x'.repeat(257)]) {
            expect(() => resolveNpcSpeechSeed(seed)).toThrow('NPC speech seed')
        }
        expect(resolveNpcSpeechSeed('example-world')).toBe('example-world')
        expect(resolveNpcSpeechSeed()).not.toBe(resolveNpcSpeechSeed())
    })
})

describe('speech profiles belong to character identities', () => {
    it('initializes once and preserves knowledge, roles, combat policy and controller changes', () => {
        const kaplya = actor('npc_magic_slime_1')
        const before = kaplya.snapshot(1000)
        const known = new Set(kaplya.abilities.known)
        const audiences = characterKnowledgeAudiences(kaplya)
        initializeNpcSpeechProfiles([kaplya], 'world-a')
        const selected = kaplya.npcSpeechProfile
        expect(selected).toBeDefined()
        expect(Object.isFrozen(selected)).toBe(true)
        expect(Object.isFrozen(selected?.traits)).toBe(true)
        expect(Object.keys(kaplya)).not.toContain('npcSpeechProfile')
        expect(
            Reflect.set(
                kaplya,
                'npcSpeechProfile',
                generateNpcSpeechProfile('world-b', kaplya.id)
            )
        ).toBe(false)
        expect(kaplya.snapshot(1000)).toEqual(before)
        expect(kaplya.abilities.known).toEqual(known)
        expect(characterKnowledgeAudiences(kaplya)).toEqual(audiences)
        expect(actorRefusesCombat(kaplya)).toBe(true)
        expect(companionProfiles[kaplya.id]?.canFollow).toBe(true)
        for (const source of ['model', 'human', 'script'] as const) {
            setCharacterControlSource(kaplya, source)
            initializeNpcSpeechProfiles([kaplya], 'world-b')
            expect(kaplya.npcSpeechProfile).toBe(selected)
        }
        kaplya.applyDamage(100_000, 2000)
        expect(kaplya.alive).toBe(false)
        restoreCharacter(kaplya, 7000, false)
        expect(kaplya.alive).toBe(true)
        expect(kaplya.npcSpeechProfile).toBe(selected)
    })

    it('skips human-owned and non-speaking characters and exposes only the selected self style', () => {
        const human = actor('player', true)
        const silent = new GameCharacter({
            id: 'mob_slime',
            nickname: 'Slime',
            archetype: 'slime',
            controllerKind: 'mob1',
            spawnPosition: { x: 80, y: 80 },
        })
        const kaplya = actor('npc_magic_slime_1')
        initializeNpcSpeechProfiles([human, silent, kaplya], 'world-a')
        expect(human.npcSpeechProfile).toBeUndefined()
        expect(silent.npcSpeechProfile).toBeUndefined()
        expect(npcSpeechContext(human)).toBeUndefined()
        const context = npcSpeechContext(kaplya)
        expect(context?.traits.map(({ id }) => id)).toEqual(
            kaplya.npcSpeechProfile?.traits
        )
        expect(Object.keys(context ?? {}).sort()).toEqual(['tone', 'traits'])
        expect(JSON.stringify(kaplya.snapshot(1000))).not.toContain(
            'npcSpeechProfile'
        )
    })

    it('assigns room NPCs before AI initialization, uses explicit seeds and keeps Mira biography', () => {
        const first = new GameRoom(undefined, { npcSpeechSeed: 'region-a' })
        const second = new GameRoom(undefined, { npcSpeechSeed: 'region-a' })
        try {
            for (const id of [
                'npc_friendly_girl_1',
                'npc_magic_slime_1',
                'npc_cleric_1',
            ]) {
                expect(first.getCharacter(id)?.npcSpeechProfile).toEqual(
                    second.getCharacter(id)?.npcSpeechProfile
                )
                expect(first.getCharacter(id)?.npcSpeechProfile).toBeDefined()
            }
            expect(
                first.getCharacter('npc_friendly_girl_1')?.soul.personality
            ).toBe(companionProfiles['npc_friendly_girl_1']?.personality)
            expect(
                first.getCharacter('npc_lumberjack_1')?.npcSpeechProfile
            ).toBeDefined()
            const human = joinScenarioRoom(first, 'Human')
            expect(human.actor.npcSpeechProfile).toBeUndefined()
        } finally {
            first.stop()
            second.stop()
        }
    })
})

describe('speech profile model projection', () => {
    it('projects only the current actor style into a real model context', () => {
        const room = new GameRoom(undefined, { npcSpeechSeed: 'region-a' })
        try {
            const kaplya = room.getCharacter('npc_magic_slime_1')
            if (kaplya === undefined) {
                throw new Error('Missing Kaplya')
            }
            const state = createNpcAiState(
                {
                    actorId: kaplya.id,
                    role: 'companion',
                    settings: defaultNpcAiSettings,
                },
                kaplya
            )
            const dialogue = new NpcAiDialogue(
                room,
                new CompanionService(),
                new NpcAiDiagnostics({ sink: () => Promise.resolve() })
            )
            const context = npcDialogueContext(
                room,
                dialogue,
                state,
                kaplya,
                1000
            )
            expect(context.speechStyle).toEqual(npcSpeechContext(kaplya))
            expect(context.personality).toBe(
                companionProfiles[kaplya.id]?.personality
            )
            expect(JSON.stringify(context.observation)).not.toContain(
                'npcSpeechProfile'
            )
            expect(JSON.stringify(context.observation)).not.toContain(
                'speechStyle'
            )
        } finally {
            room.stop()
        }
    })
})
