import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import type { KnowledgeResult } from '../src/ai/characterKnowledge'
import { CharacterMemory } from '../src/ai/characterMemory'
import { defaultNpcAiSettings } from '../src/ai/config'
import { setKnowledgeResidences } from '../src/ai/knowledgeAudiences'
import { npcKnowledgeInformation } from '../src/ai/knowledgeInformation'
import { characterKnowledgeScope } from '../src/ai/knowledgeScope'
import { createNpcAiState } from '../src/ai/runtimeState'
import { invokeNpcAiTurn } from '../src/ai/turn'
import type { NpcAiContext, NpcAiReply } from '../src/ai/types'
import { GameCharacter } from '../src/game/character'
import { GameRoom } from '../src/game/room'

beforeEach(() => vi.stubGlobal('Bun', { env: {} }))
afterEach(() => vi.unstubAllGlobals())

function actor(id: string): GameCharacter {
    return new GameCharacter({
        id,
        nickname: id,
        archetype: 'human',
        controllerKind: 'scripted',
        spawnPosition: { x: 0, y: 0 },
    })
}

it('summarizes only permitted subjects and expertise without article identifiers or prose', () => {
    const resident = actor('npc_wanderer_1')
    const scope = characterKnowledgeScope(resident)
    expect(scope.topics).toContain('Лес и древесина')
    expect(scope.topics).toContain('Местные жители и службы')
    expect(scope.expertise).not.toContain('Лесное дело')
    expect(scope.expertise).not.toContain('Молитвенное учение')
    expect(scope.topics).not.toContain('Личные сведения')
    expect(JSON.stringify(scope)).not.toMatch(
        /forestry\.|person\.|npc_|knowledge\/|8 древесины|Капля/
    )
    resident.tags.add('worker.lumberjack')
    expect(characterKnowledgeScope(resident).expertise).toContain('Лесное дело')
    setKnowledgeResidences(resident, [])
    expect(characterKnowledgeScope(resident).topics).not.toContain(
        'Местные жители и службы'
    )
})

it('keeps personal knowledge private and describes actual learned doctrine without granting abilities', () => {
    const kaplya = actor('npc_magic_slime_1')
    expect(characterKnowledgeScope(kaplya).topics).toContain('Личные сведения')
    const cleric = actor('learner')
    cleric.abilities.known.add('pray')
    const known = [...cleric.abilities.known]
    expect(characterKnowledgeScope(cleric, false)).toMatchObject({
        expertise: ['Молитвенное учение'],
        canSearch: false,
        lookupsRemaining: 0,
    })
    expect([...cleric.abilities.known]).toEqual(known)
})

it.each(['death', 'generation', 'identity', 'mind', 'lease'] as const)(
    'binds information ports to the real living actor and rejects changed %s',
    async (change) => {
        const room = new GameRoom()
        try {
            const npc = room.getCharacter('npc_magic_slime_1')
            if (npc === undefined) {
                throw new Error('Missing authored NPC')
            }
            const state = createNpcAiState(
                {
                    actorId: npc.id,
                    role: 'companion',
                    settings: defaultNpcAiSettings,
                },
                npc
            )
            state.token = 'bound-lease'
            let owner = true
            const retrieve = vi.fn(() =>
                Promise.resolve<KnowledgeResult>({
                    groups: [],
                    entries: [],
                    memories: [],
                })
            )
            const info = npcKnowledgeInformation({
                state,
                actor: npc,
                room,
                knowledge: {
                    retrieve,
                    deep: () =>
                        Promise.resolve({ personId: 'p', status: 'not_known' }),
                },
                companions: { isModelControlOwner: () => owner },
                current: () => true,
                clock: () => 1,
            })
            expect(info.current?.()).toBe(true)
            if (change === 'death') {
                npc.alive = false
            }
            if (change === 'generation') {
                state.generation += 1
            }
            if (change === 'identity') {
                state.actor = actor(npc.id)
            }
            if (change === 'mind') {
                state.mind = new CharacterMemory(npc.id)
            }
            if (change === 'lease') {
                owner = false
            }
            expect(info.current?.()).toBe(false)
            await expect(info.search?.('дерево')).rejects.toThrow(
                'authority changed'
            )
            expect(retrieve).not.toHaveBeenCalled()
        } finally {
            room.stop()
        }
    }
)

it('rejects a late lookup result after its real NPC dies', async () => {
    const room = new GameRoom()
    try {
        const npc = room.getCharacter('npc_magic_slime_1')
        if (npc === undefined) {
            throw new Error('Missing authored NPC')
        }
        const state = createNpcAiState(
            {
                actorId: npc.id,
                role: 'companion',
                settings: defaultNpcAiSettings,
            },
            npc
        )
        const pending = Promise.withResolvers<KnowledgeResult>()
        state.token = 'lease'
        const info = npcKnowledgeInformation({
            state,
            actor: npc,
            room,
            knowledge: {
                retrieve: () => pending.promise,
                deep: () =>
                    Promise.resolve({ personId: 'p', status: 'not_known' }),
            },
            companions: { isModelControlOwner: () => true },
            current: () => true,
            clock: () => 1,
        })
        const result = info.search?.('дерево')
        npc.alive = false
        pending.resolve({ groups: [], entries: [], memories: [] })
        await expect(result).rejects.toThrow('authority changed')
    } finally {
        room.stop()
    }
})

it.each([
    ['first', 'identity'],
    ['second', 'identity'],
    ['first', 'lease'],
    ['second', 'lease'],
] as const)(
    'does not publish after %s model invocation changes %s without a generation bump',
    async (stage, change) => {
        const room = new GameRoom()
        try {
            const npc = room.getCharacter('npc_magic_slime_1')
            if (npc === undefined) {
                throw new Error('Missing authored NPC')
            }
            const state = createNpcAiState(
                {
                    actorId: npc.id,
                    role: 'companion',
                    settings: defaultNpcAiSettings,
                },
                npc
            )
            state.token = 'lease'
            let owned = true
            const empty: KnowledgeResult = {
                groups: [],
                entries: [],
                memories: [],
            }
            const information = npcKnowledgeInformation({
                state,
                actor: npc,
                room,
                knowledge: {
                    retrieve: () => Promise.resolve(empty),
                    deep: () =>
                        Promise.resolve({ personId: 'p', status: 'not_known' }),
                },
                companions: { isModelControlOwner: () => owned },
                current: () => true,
                clock: () => 1,
            })
            const context = {
                actorId: npc.id,
                role: 'companion',
                personality: '',
                task: null,
                events: [],
                memory: '',
                facts: [],
                observation: {},
            } as unknown as NpcAiContext
            let calls = 0
            await invokeNpcAiTurn(
                state,
                context,
                {
                    decide: () => {
                        calls += 1
                        const base: NpcAiReply = {
                            decision: null,
                            memory: '',
                            done: true,
                            waitMs: 1000,
                        }
                        if (stage === 'second' && calls === 1) {
                            return Promise.resolve({
                                ...base,
                                informationRequest: {
                                    type: 'knowledge_search' as const,
                                    query: 'дерево',
                                },
                            })
                        }
                        if (change === 'identity') {
                            state.actor = actor(npc.id)
                        }
                        if (change === 'lease') {
                            owned = false
                        }
                        return Promise.resolve({
                            ...base,
                            speech: 'Устаревший ответ.',
                        })
                    },
                },
                () => true,
                { ...information, reserveCall: () => true }
            )
            expect(state.generation).toBe(0)
            expect(calls).toBe(stage === 'first' ? 1 : 2)
            expect(state.ready).not.toHaveProperty('reply')
            expect(
                state.ready !== undefined && 'error' in state.ready
                    ? state.ready.error
                    : ''
            ).toContain('cancelled')
        } finally {
            room.stop()
        }
    }
)
