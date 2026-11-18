import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import {
    CharacterKnowledge,
    characterKnowledge,
} from '../src/ai/characterKnowledge'
import { defaultNpcAiSettings } from '../src/ai/config'
import { NpcAiDiagnostics } from '../src/ai/diagnostics'
import { NpcAiDialogue } from '../src/ai/dialogue'
import { npcDialogueContext } from '../src/ai/dialogueContext'
import type { EmbeddingProvider } from '../src/ai/embeddingTypes'
import { npcIdentityContext } from '../src/ai/npcIdentityInstructions'
import { PersistentVectorCache } from '../src/ai/persistentVectorCache'
import { createNpcAiState } from '../src/ai/runtimeState'
import { invokeNpcAiTurn } from '../src/ai/turn'
import type { NpcAiContext, NpcAiReply, NpcAiRole } from '../src/ai/types'
import type { GameCharacter } from '../src/game/character'
import { companionProfiles } from '../src/game/companionProfiles'
import { CompanionService } from '../src/game/companions'
import { npcIdentityDefinitions } from '../src/game/npcIdentityCatalog'
import { generateNpcIdentityProfile } from '../src/game/npcIdentityProfiles'
import { GameRoom } from '../src/game/room'
import { joinScenarioRoom } from './scenarioRoomHelpers'

const rooms: GameRoom[] = []
const services: CharacterKnowledge[] = []
const directories: string[] = []
const actors = [
    { id: 'npc_friendly_girl_1', role: 'city_coordinator' },
    { id: 'npc_magic_slime_1', role: 'companion' },
    { id: 'npc_cleric_1', role: 'advisor' },
] as const

beforeEach(() => vi.stubGlobal('Bun', { env: {} }))
afterEach(async () => {
    services.splice(0).forEach((service) => service.stop())
    rooms.splice(0).forEach((room) => room.stop())
    for (const directory of directories.splice(0)) {
        await rm(directory, { recursive: true, force: true })
    }
    vi.unstubAllGlobals()
})

function fixture(
    id = actors[0].id as string,
    role: NpcAiRole = 'city_coordinator'
) {
    const room = new GameRoom(undefined, {
        npcIdentitySeed: 'identity-context',
        npcSpeechSeed: 'identity-speech',
    })
    rooms.push(room)
    const actor = room.getCharacter(id)
    if (actor?.npcIdentityProfile === undefined) {
        throw new Error(`Missing authored NPC identity: ${id}`)
    }
    const player = joinScenarioRoom(room, 'Identity listener').actor
    const state = createNpcAiState(
        { actorId: actor.id, role, settings: defaultNpcAiSettings },
        actor
    )
    state.dialogue = {
        kind: 'message',
        id: 'identity-question',
        senderId: player.id,
        text: 'Кто ты и как здесь оказалась?',
        locationId: actor.locationId,
        position: { ...actor.position },
        at: 1000,
    }
    const dialogue = new NpcAiDialogue(
        room,
        new CompanionService(),
        new NpcAiDiagnostics({ sink: () => Promise.resolve() })
    )
    const context = () => npcDialogueContext(room, dialogue, state, actor, 1000)
    return { room, actor, player, state, context }
}

function reply(change: Partial<NpcAiReply> = {}): NpcAiReply {
    return {
        decision: null,
        taskAcceptance: 'none',
        companionOrder: null,
        speech: null,
        memory: '',
        done: true,
        waitMs: 1000,
        ...change,
    }
}

function allStories(): string[] {
    return Object.values(npcIdentityDefinitions).flatMap((definition) =>
        definition.backstories.map(({ text }) => text)
    )
}

function assertOwnIdentity(context: NpcAiContext, actor: GameCharacter): void {
    const profile = actor.npcIdentityProfile
    if (profile === undefined) {
        throw new Error('Missing selected identity')
    }
    expect(context.selfIdentity).toMatchObject({
        name: profile.name,
        gender: profile.gender,
        selfReference: profile.selfReference,
        description: profile.description,
        responsibilities: profile.responsibilities,
        backstory: profile.backstory.text,
    })
    expect(context.selfIdentity?.selfReferenceGuidance.length).toBeGreaterThan(
        0
    )
    expect(Object.keys(context.selfIdentity ?? {}).sort()).toEqual([
        'backstory',
        'description',
        'gender',
        'name',
        'responsibilities',
        'selfReference',
        'selfReferenceGuidance',
        ...(profile.speechHabits === undefined ? [] : ['speechHabits']),
    ])
    for (const story of allStories()) {
        if (story !== profile.backstory.text) {
            expect(JSON.stringify(context)).not.toContain(story)
        }
    }
}

it('projects grammar guidance from authored self-reference instead of the name or species', () => {
    const neutral = generateNpcIdentityProfile(
        'grammar',
        'some-creature',
        'kaplya'
    )
    const masculine = generateNpcIdentityProfile(
        'grammar',
        'some-creature',
        'kaplya',
        {
            ...npcIdentityDefinitions.kaplya,
            selfReference: 'masculine',
            gender: 'male',
        }
    )
    expect(neutral.name).toBe(masculine.name)
    expect(
        npcIdentityContext({ npcIdentityProfile: neutral })
            ?.selfReferenceGuidance
    ).toContain('среднем роде')
    expect(
        npcIdentityContext({ npcIdentityProfile: masculine })
            ?.selfReferenceGuidance
    ).toContain('мужском роде')
    expect(npcIdentityContext({})).toBeUndefined()
})

it.each(actors)(
    'projects only $id own selected biography on the first call',
    ({ id, role }) => {
        const { actor, context } = fixture(id, role)
        assertOwnIdentity(context(), actor)
        expect(context().selfIdentity).toMatchObject(
            npcIdentityContext(actor) ?? {}
        )
        const observation = JSON.stringify(context().observation)
        expect(observation).not.toContain('npcIdentityProfile')
        for (const story of allStories()) {
            expect(observation).not.toContain(story)
            expect(JSON.stringify(actor.snapshot(1000))).not.toContain(story)
        }
    }
)

it.each(['knowledge_search', 'deep_memory', 'repair'] as const)(
    'retains the same own identity through %s with the shared two-call limit',
    async (kind) => {
        const { actor, state, context } = fixture(
            'npc_magic_slime_1',
            'companion'
        )
        const first = context()
        first.knowledgeScope = {
            topics: [],
            expertise: [],
            canSearch: true,
            lookupsRemaining: 1,
        }
        const calls: NpcAiContext[] = []
        await invokeNpcAiTurn(
            state,
            first,
            {
                decide: (input) => {
                    calls.push(input)
                    return Promise.resolve(
                        calls.length === 2
                            ? reply({ speech: 'Я расскажу о своём прошлом.' })
                            : kind === 'repair'
                              ? reply({
                                    decision: {
                                        type: 'move_to',
                                        target: { x: 100, y: 100 },
                                    },
                                })
                              : reply({
                                    informationRequest:
                                        kind === 'knowledge_search'
                                            ? {
                                                  type: kind,
                                                  query: 'городская гильдия',
                                              }
                                            : {
                                                  type: kind,
                                                  personId: 'known-former-hero',
                                              },
                                })
                    )
                },
            },
            () => true,
            {
                reserveCall: () => true,
                refreshContext: context,
                search: () =>
                    Promise.resolve({ groups: [], entries: [], memories: [] }),
                lookup: () =>
                    Promise.resolve({
                        personId: 'known-former-hero',
                        status: 'not_known',
                    }),
            }
        )
        expect(calls).toHaveLength(2)
        calls.forEach((input) => assertOwnIdentity(input, actor))
        expect(state.modelCallsByInput.get('identity-question')).toBe(2)
        expect(state.ready).toHaveProperty('reply')
    }
)

it.each(['greeting', 'self_activity'] as const)(
    'uses the same own identity for a %s background turn',
    (background) => {
        const { actor, player, state, context } = fixture()
        state.dialogue = undefined
        state.task = {
            id: `background-${background}`,
            requesterId: null,
            request: 'Самостоятельное решение по текущей обстановке.',
            steps: 0,
            background,
            ...(background === 'greeting' ? { targetId: player.id } : {}),
        }
        assertOwnIdentity(context(), actor)
    }
)

it('does not mistake an authored NPC role for companion permission or a public life story', () => {
    const { room, actor } = fixture('npc_cleric_1', 'advisor')
    expect(actor.soul.personality).toContain('клирик часовни')
    expect(companionProfiles[actor.id]).toBeUndefined()
    expect(actor.mortal).toBe(false)
    expect(actor.soul.companion).toBeNull()
    for (const { id } of actors) {
        const npc = room.getCharacter(id)
        if (npc === undefined) {
            throw new Error('Missing room NPC')
        }
        const entries = characterKnowledge(npc, room.navigationFor(npc))
        expect(entries.some((entry) => entry.id === `person:${id}`)).toBe(false)
        for (const story of allStories()) {
            expect(JSON.stringify(entries)).not.toContain(story)
        }
    }
    const bran = room.getCharacter('npc_veteran_1')
    if (bran === undefined) {
        throw new Error('Missing unrelated NPC')
    }
    expect(
        characterKnowledge(bran, room.navigationFor(bran)).some(
            (entry) => entry.id === `person:${bran.id}`
        )
    ).toBe(true)
})

it('keeps a legitimately heard story attributed and ephemeral instead of persisting a private biography', async () => {
    const { room, actor, state, context } = fixture()
    const kaplya = room.getCharacter('npc_magic_slime_1')
    const story = kaplya?.npcIdentityProfile?.backstory.text
    if (kaplya === undefined || story === undefined) {
        throw new Error('Missing storyteller')
    }
    const directory = await mkdtemp(join(tmpdir(), 'ratata-identity-cache-'))
    directories.push(directory)
    const cache = new PersistentVectorCache(join(directory, 'vectors.json'), {
        fingerprint: 'npc-identity-test',
        dimensions: 2,
    })
    const embed = vi.fn<EmbeddingProvider['embed']>((texts) =>
        Promise.resolve(texts.map(() => [1, 0]))
    )
    const knowledge = new CharacterKnowledge(
        { embed, persistentCache: () => cache },
        () => undefined
    )
    services.push(knowledge)
    const before = await knowledge.retrieve(
        actor,
        room.navigationFor(actor),
        state.mind,
        'прошлое'
    )
    expect(before.memories).toEqual([])
    const initialPassages = embed.mock.calls
        .filter(([, query]) => query !== true)
        .flatMap(([texts]) => texts)
    allStories().forEach((text) => expect(initialPassages).not.toContain(text))
    state.mind.remember({
        id: 'kaplya-told-own-past',
        senderId: kaplya.id,
        senderName: kaplya.nickname,
        conversationPartnerId: actor.id,
        text: story,
        at: 900,
        channel: 'say',
        source: 'heard',
        locationId: actor.locationId,
    })
    const result = await knowledge.retrieve(
        actor,
        room.navigationFor(actor),
        state.mind,
        'прошлое'
    )
    expect(result.memories).toContainEqual({
        id: 'kaplya-told-own-past',
        text: story,
        senderId: kaplya.id,
        source: 'heard',
        at: 900,
    })
    expect(embed.mock.calls.flatMap(([texts]) => texts)).toContain(story)
    for (const text of allStories()) {
        expect(await cache.get(text)).toBeUndefined()
    }
    expect(context().selfIdentity).toMatchObject(
        npcIdentityContext(actor) ?? {}
    )
    expect(state.mind.deep(kaplya.id).messages).toContainEqual(
        expect.objectContaining({
            senderId: kaplya.id,
            text: story,
            source: 'heard',
        })
    )
})
