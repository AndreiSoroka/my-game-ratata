import { prayerAbilityIds } from '@my-game-ratata/contracts'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import {
    CharacterKnowledge,
    characterKnowledge,
} from '../src/ai/characterKnowledge'
import { CharacterMemory } from '../src/ai/characterMemory'
import { knowledgeCorpus } from '../src/ai/knowledgeCorpus'
import { handleAbilityCommand } from '../src/game/abilityCommands'
import { GameCharacter } from '../src/game/character'
import { advanceRevive } from '../src/game/characterLife'
import { recordUsefulResourceSpend } from '../src/game/resourcePractice'
import { GameRoom } from '../src/game/room'

beforeEach(() => vi.stubGlobal('Bun', { env: {} }))
afterEach(() => vi.unstubAllGlobals())

function fixture() {
    const room = new GameRoom()
    const vera = room.getCharacter('npc_cleric_1')
    if (vera === undefined) {
        throw new Error('Missing authored cleric')
    }
    const student = new GameCharacter({
        id: 'prayer-student',
        nickname: 'Ученик',
        archetype: 'human',
        heroClass: 'vanguard',
        controllerKind: 'network_player',
        faction: 'peaceful',
        spawnPosition: { ...vera.position },
    })
    return {
        room,
        vera,
        student,
        context: {
            characters: [student, vera],
            navigation: room.navigationFor(vera),
            now: 1000,
            random: () => 0,
        },
    }
}

it('authors only Mother and Wanderer prayers on Vera without opening foreign school stars', () => {
    const { room, vera } = fixture()
    try {
        expect(
            prayerAbilityIds.filter((id) => vera.abilities.known.has(id))
        ).toEqual(['pray', 'pray_road'])
        const ids = characterKnowledge(vera, room.navigationFor(vera)).map(
            (entry) => entry.id
        )
        const paths =
            vera.snapshot(1000).progression?.constellations?.paths ?? []
        for (const path of ['prayer', 'prayer_road']) {
            expect(paths.find(({ id }) => id === path)?.unlocked).toBe(true)
        }
        for (const path of ['prayer_lantern', 'prayer_grave']) {
            expect(paths.find(({ id }) => id === path)).toMatchObject({
                unlocked: false,
            })
            expect(paths.find(({ id }) => id === path)?.name).toBeUndefined()
        }
        expect(ids).toContain('faith.mother')
        expect(ids).toContain('faith.road')
        expect(ids).not.toContain('faith.lantern')
        expect(ids).not.toContain('faith.grave')
    } finally {
        room.stop()
    }
})

it('teaches both known prayers through ordinary ability commands and refuses unknown schools', () => {
    const { room, vera, student, context } = fixture()
    try {
        for (const abilityId of ['pray_lantern', 'pray_grave'] as const) {
            const result = handleAbilityCommand(
                student,
                {
                    type: 'learn_ability',
                    abilityId,
                    targetId: vera.id,
                },
                context
            )
            expect(result).toContainEqual(
                expect.objectContaining({ kind: 'notice' })
            )
            expect(student.abilities.known.has(abilityId)).toBe(false)
        }
        for (const abilityId of ['pray', 'pray_road'] as const) {
            handleAbilityCommand(
                student,
                {
                    type: 'learn_ability',
                    abilityId,
                    targetId: vera.id,
                },
                context
            )
            expect(student.abilities.known.has(abilityId)).toBe(true)
        }
        expect(
            prayerAbilityIds.filter((id) => vera.abilities.known.has(id))
        ).toEqual(['pray', 'pray_road'])
    } finally {
        room.stop()
    }
})

it('filters unlearned school texts before lexical and semantic search for every character', async () => {
    const { room, vera, student, context } = fixture()
    const embedded: string[] = []
    const search = new CharacterKnowledge(
        {
            embed: (texts) => {
                embedded.push(...texts)
                return Promise.resolve(texts.map(() => [1, 0]))
            },
        },
        () => undefined
    )
    try {
        const forbidden = knowledgeCorpus().filter((article) =>
            ['faith.lantern', 'faith.grave'].includes(article.id)
        )
        expect(forbidden).toHaveLength(2)
        const query =
            'Подробности молитвы Праха, возвращение нежити и мана Архивариуса'
        for (const actor of [vera, student]) {
            const result = await search.retrieve(
                actor,
                context.navigation,
                new CharacterMemory(actor.id),
                query
            )
            expect(
                result.entries.some((entry) =>
                    ['faith.lantern', 'faith.grave'].includes(entry.id)
                )
            ).toBe(false)
        }
        forbidden.forEach((article) => {
            expect(embedded.some((text) => text.includes(article.text))).toBe(
                false
            )
        })
        student.abilities.known.add('pray_lantern')
        expect(
            characterKnowledge(student, context.navigation).some(
                (entry) => entry.id === 'faith.lantern'
            )
        ).toBe(true)
        expect(
            characterKnowledge(student, context.navigation).some(
                (entry) => entry.id === 'faith.grave'
            )
        ).toBe(false)
    } finally {
        search.stop()
        room.stop()
    }
})

it('uses learned Mother and Wanderer prayers one after another, never as simultaneous casts', () => {
    const { room, vera, student, context } = fixture()
    try {
        for (const abilityId of ['pray', 'pray_road'] as const) {
            handleAbilityCommand(
                student,
                {
                    type: 'learn_ability',
                    abilityId,
                    targetId: vera.id,
                },
                context
            )
        }
        student.hp -= 12
        student.energy -= 20
        recordUsefulResourceSpend(student, 'energy', 20)
        const originalHealth = student.hp
        const originalEnergy = student.energy
        const intent = { mode: 'restore', targetId: student.id } as const
        expect(
            handleAbilityCommand(
                student,
                {
                    type: 'use_ability',
                    abilityId: 'pray',
                    intent,
                },
                context
            )
        ).toContainEqual(
            expect.objectContaining({
                kind: 'cast',
                phase: 'started',
                abilityId: 'pray',
            })
        )
        const endsAt = student.abilities.casting?.completesAt
        if (endsAt === undefined) {
            throw new Error('Missing prayer cast')
        }
        expect(
            handleAbilityCommand(
                student,
                {
                    type: 'use_ability',
                    abilityId: 'pray_road',
                    intent,
                },
                { ...context, now: 1001 }
            ).some((event) => event.kind === 'cast')
        ).toBe(false)
        expect(student.abilities.casting?.abilityId).toBe('pray')
        const getCharacter = (id: string) =>
            context.characters.find((actor) => actor.id === id)
        advanceRevive(student, getCharacter, endsAt, undefined, {
            ...context,
            now: endsAt,
        })
        expect(student.hp).toBeGreaterThan(originalHealth)
        expect(student.energy).toBe(originalEnergy)
        expect(
            handleAbilityCommand(
                student,
                {
                    type: 'use_ability',
                    abilityId: 'pray_road',
                    intent,
                },
                { ...context, now: endsAt }
            )
        ).toContainEqual(
            expect.objectContaining({
                kind: 'cast',
                phase: 'started',
                abilityId: 'pray_road',
            })
        )
        const roadEndsAt = student.abilities.casting?.completesAt
        if (roadEndsAt === undefined) {
            throw new Error('Missing Wanderer cast')
        }
        advanceRevive(student, getCharacter, roadEndsAt, undefined, {
            ...context,
            now: roadEndsAt,
        })
        expect(student.energy).toBeGreaterThan(originalEnergy)
    } finally {
        room.stop()
    }
})
