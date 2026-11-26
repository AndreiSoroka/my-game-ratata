import assert from 'node:assert/strict'

import {
    CENTER_LOCATION_ID,
    GRAVE_MAX_LIVING,
    GRAVE_SPAWN_INTERVAL_MS,
} from '@my-game-ratata/contracts'
import { expect, it, vi } from 'vitest'

import { resolveCharacterDamage } from '../src/game/abilityDamage'
import type { GameCharacter } from '../src/game/character'
import { GameRoom } from '../src/game/room'
import { createSkeleton } from '../src/game/spawns'
import { graveNavigation, roomLifeFixture } from './graveTestHelpers'
import { joinScenarioRoom } from './scenarioRoomHelpers'

const startsAt = 10_000
const returnDelay = 60_000

function kill(actor: GameCharacter, target: GameCharacter, now: number) {
    const { events } = resolveCharacterDamage({
        actor,
        target,
        now,
        amount: target.maxHp * 10,
        damageKind: 'physical',
        respawnDelayMs: 15_000,
    })
    expect(events).toContainEqual(
        expect.objectContaining({ kind: 'death', targetId: target.id })
    )
    return events
}

function corpseId(skeleton: GameCharacter): string {
    return `corpse:${skeleton.id}:${String(skeleton.deathSequence)}`
}

it('counts a fallen skeleton against its grave limit until its bone is collected', () => {
    const f = roomLifeFixture()
    const { hero, world, characters } = f
    hero.locationId = CENTER_LOCATION_ID
    const { navigation, inventory } = world.get(hero.locationId)
    const population = Array.from({ length: GRAVE_MAX_LIVING }, (_, index) => {
        const { character } = createSkeleton(
            navigation,
            `_grave_limit_${String(index)}`,
            { x: 8 + index, y: 10 },
            'none'
        )
        characters.set(character.id, character)
        return character
    })
    const [skeleton] = population
    assert(skeleton !== undefined, 'The grave fixture includes a skeleton')
    f.life.registerGraves(
        [
            {
                source: {
                    id: 'grave-limit',
                    locationId: hero.locationId,
                    position: { x: 168, y: 168 },
                },
                initialChildren: population.map(({ id }) => id),
            },
        ],
        startsAt
    )
    hero.position = { x: skeleton.position.x, y: skeleton.position.y - 8 }
    const firstBirth = startsAt + GRAVE_SPAWN_INTERVAL_MS
    const firstDeath = firstBirth - 1_000
    inventory.dropLootForDeaths(kill(hero, skeleton, firstDeath), (id) =>
        characters.get(id)
    )

    f.advance(firstBirth)
    expect(skeleton.alive).toBe(false)
    expect(characters.size).toBe(GRAVE_MAX_LIVING + 1)
    f.advance(firstDeath + returnDelay)
    expect(characters.get(skeleton.id)).toBe(skeleton)
    expect(skeleton.hp).toBe(Math.ceil(skeleton.maxHp / 2))
    expect(characters.size).toBe(GRAVE_MAX_LIVING + 1)

    const nextBirth = firstBirth + GRAVE_SPAWN_INTERVAL_MS
    const secondDeath = nextBirth - 1_000
    inventory.dropLootForDeaths(kill(hero, skeleton, secondDeath), (id) =>
        characters.get(id)
    )
    const chestId = corpseId(skeleton)
    const pickupAt = secondDeath + 500
    inventory.containers.handle(hero, { type: 'open_chest', chestId }, pickupAt)
    expect(
        inventory.containers.handle(
            hero,
            { type: 'take_all_chest_items', chestId },
            pickupAt
        )
    ).toContainEqual(
        expect.objectContaining({ kind: 'item_pickup', itemId: 'bone' })
    )
    f.advance(nextBirth)
    expect(characters.has(skeleton.id)).toBe(false)
    expect(characters.size).toBe(GRAVE_MAX_LIVING + 1)
    expect(characters.get('mob_skeleton_1_grave_grave-limit_1')?.alive).toBe(
        true
    )
})

it('credits the skeleton guild hunt once, after its second fall is made permanent', async () => {
    vi.stubGlobal('Bun', { env: {} })
    vi.useFakeTimers()
    let now = startsAt
    const room = new GameRoom(graveNavigation(), { worldClock: () => now })
    try {
        const { actor: hero, send } = joinScenarioRoom(
            room,
            'Bone quest tester',
            'vanguard'
        )
        const tickAt = async (at: number) => {
            now = at
            await vi.advanceTimersByTimeAsync(50)
        }
        const mira = room.getCharacter('npc_friendly_girl_1')
        const skeleton = room.getCharacter('mob_skeleton_1_map-2-1')
        assert(
            mira !== undefined && skeleton !== undefined,
            'The room includes the clerk and a skeleton'
        )
        hero.position = { ...mira.position }
        room.start()
        send({
            type: 'chat',
            targetId: mira.id,
            text: 'Хочу взять «Кости старого тракта»',
        })
        await tickAt(startsAt + 50)
        const view = () => room.snapshot(now, hero.locationId, hero.id)
        const offer = view().social?.questOffer ?? undefined
        assert(offer !== undefined, 'Mira offers the skeleton hunt')
        expect(offer.guildQuestId).toBe('skeleton_hunt')
        send({
            type: 'quest_offer_answer',
            offerId: offer.id,
            revision: offer.revision,
            accept: true,
        })
        await tickAt(startsAt + 100)
        const progress = () =>
            view().party?.activeJobs.find(({ id }) => id === 'skeleton_hunt')
                ?.progress
        expect(progress()).toBe(0)
        hero.locationId = skeleton.locationId
        hero.position = { x: skeleton.position.x, y: skeleton.position.y - 8 }
        const witness = joinScenarioRoom(
            room,
            'Bone quest witness',
            'vanguard'
        ).actor
        witness.locationId = hero.locationId
        witness.position = { ...hero.position }

        const firstDeath = kill(witness, skeleton, now)
        room.publishEvents(firstDeath)
        expect(progress()).toBe(0)
        await tickAt(now + returnDelay)
        expect(room.getCharacter(skeleton.id)).toBe(skeleton)
        expect(skeleton.alive).toBe(true)
        expect(progress()).toBe(0)

        const secondDeath = now + 1_000
        now = secondDeath
        const secondDefeat = kill(hero, skeleton, secondDeath)
        room.publishEvents(firstDeath.filter(({ kind }) => kind === 'death'))
        room.publishEvents(secondDefeat)
        expect(progress()).toBe(0)
        const chestId = corpseId(skeleton)
        send({ type: 'open_chest', chestId })
        send({ type: 'take_all_chest_items', chestId })
        expect(
            hero.inventory.filter(({ itemId }) => itemId === 'bone')
        ).toHaveLength(1)
        await tickAt(secondDeath + 1_000)
        expect(room.getCharacter(skeleton.id)).toBeUndefined()
        expect(progress()).toBe(1)

        send({ type: 'take_all_chest_items', chestId })
        await tickAt(secondDeath + returnDelay)
        expect(
            hero.inventory.filter(({ itemId }) => itemId === 'bone')
        ).toHaveLength(1)
        expect(progress()).toBe(1)
    } finally {
        room.stop()
        vi.useRealTimers()
        vi.unstubAllGlobals()
    }
})
