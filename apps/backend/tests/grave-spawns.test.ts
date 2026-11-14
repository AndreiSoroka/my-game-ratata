import {
    CENTER_LOCATION_ID,
    GRAVE_SPAWN_INTERVAL_MS,
} from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { retireCharacter } from '../src/game/characterLife'
import { Mob1Controller } from '../src/game/controllers'
import { advanceCharacter } from '../src/game/movement'
import { createSkeleton } from '../src/game/spawns'
import { graveFixture, graveHero } from './graveTestHelpers'

const now = 10_000
const interval = GRAVE_SPAWN_INTERVAL_MS

describe('final player identity graves', () => {
    it('waits 30 server seconds after finalization, copies the actual map, and records each identity once', () => {
        const f = graveFixture()
        const hero = graveHero()
        hero.applyDamage(hero.hp, now)
        f.service.schedule(hero, now)
        f.service.update(now + 30_000, f.context)
        expect(f.created).toHaveLength(0)
        retireCharacter(hero)
        f.service.schedule(hero, now + 60_000)
        f.service.schedule(hero, now + 70_000)
        expect(f.service.snapshot(hero.locationId)).toEqual([
            {
                id: `final:${hero.id}`,
                locationId: hero.locationId,
                position: hero.position,
            },
        ])
        hero.locationId = CENTER_LOCATION_ID
        hero.position = { x: 24, y: 24 }
        f.service.update(now + 89_999, f.context)
        expect(f.created).toHaveLength(0)
        f.service.update(now + 90_000, f.context)
        expect(f.created).toHaveLength(1)
        expect(f.created[0]?.character).toMatchObject({
            locationId: 'map-3-2',
            position: { x: 168, y: 168 },
            archetype: 'skeleton',
            faction: 'monsters',
            controllerKind: 'mob1',
            respawnPolicy: 'none',
        })
        f.service.schedule(hero, now + 100_000)
        f.service.update(now + 100_000, f.context)
        expect(f.created).toHaveLength(1)
        expect(f.service.snapshot(CENTER_LOCATION_ID)).toEqual([])
    })

    it('allows dynamic graves in the city without scheduling NPC deaths', () => {
        const f = graveFixture()
        const hero = graveHero('city-player', CENTER_LOCATION_ID)
        hero.applyDamage(hero.hp, now)
        retireCharacter(hero)
        const npc = new GameCharacter({
            id: 'mortal-npc',
            nickname: 'NPC',
            archetype: 'human',
            controllerKind: 'scripted',
            mortal: true,
            spawnPosition: hero.position,
        })
        npc.applyDamage(npc.hp, now)
        retireCharacter(npc)
        f.service.schedule(npc, now)
        f.service.schedule(hero, now)
        f.service.update(now + 30_000, f.context)
        expect(f.created).toHaveLength(1)
        expect(f.created[0]?.character.locationId).toBe(CENTER_LOCATION_ID)
    })
})

describe('periodic grave births', () => {
    it('counts initial and traveling descendants, caps three living, and waits for the next cadence after a kill', () => {
        const f = graveFixture()
        const initial = createSkeleton(
            f.navigation,
            '_initial',
            { x: 10, y: 10 },
            'none'
        )
        f.context.add(initial)
        const source = {
            id: 'grave-a',
            locationId: initial.character.locationId,
            position: { x: 168, y: 168 },
        }
        f.service.register(source, [initial.character.id], now)
        f.service.update(now + interval - 1, f.context)
        expect(f.created).toHaveLength(1)
        f.service.update(now + interval, f.context)
        f.service.update(now + 2 * interval, f.context)
        expect(f.created).toHaveLength(3)
        initial.character.locationId = 'map-0-0'
        f.service.update(now + 3 * interval, f.context)
        expect(f.created).toHaveLength(3)
        initial.character.applyDamage(
            initial.character.hp,
            now + 3 * interval + 1
        )
        initial.character.queueRespawn(now + 3 * interval + 1, 15_000)
        advanceCharacter({
            character: initial.character,
            navigation: f.navigation,
            now: now + 3 * interval + 15_001,
            deltaMs: 50,
        })
        expect(initial.character.alive).toBe(false)
        f.service.update(now + 3 * interval + 15_001, f.context)
        expect(f.characters.has(initial.character.id)).toBe(false)
        expect(f.created).toHaveLength(3)
        f.service.update(now + 4 * interval - 1, f.context)
        expect(f.created).toHaveLength(3)
        f.service.update(now + 4 * interval, f.context)
        expect(f.created).toHaveLength(4)
        expect(
            new Set(f.created.map(({ character }) => character.id)).size
        ).toBe(4)
    })

    it('keeps independent grave budgets, ignores repeated registration, and does not catch up a long pause in a burst', () => {
        const f = graveFixture()
        const a = {
            id: 'a',
            locationId: CENTER_LOCATION_ID,
            position: { x: 168, y: 168 },
        }
        const b = { ...a, id: 'b', position: { x: 56, y: 56 } }
        f.service.register(a, [], now)
        f.service.register(a, [], now + 500)
        f.service.register(b, [], now + 1_000)
        f.service.update(now + interval, f.context)
        expect(f.created).toHaveLength(1)
        f.service.update(now + interval + 999, f.context)
        expect(f.created).toHaveLength(1)
        f.service.update(now + interval + 1_000, f.context)
        expect(f.created).toHaveLength(2)
        f.service.update(now + 100 * interval, f.context)
        expect(f.created).toHaveLength(4)
        f.service.update(now + 100 * interval, f.context)
        expect(f.created).toHaveLength(4)
    })
})

describe('safe shared skeleton placement', () => {
    it('avoids current terrain, actors and loot, then waits if the whole nearby area is blocked', () => {
        const f = graveFixture()
        const hero = graveHero('fallen', CENTER_LOCATION_ID)
        hero.applyDamage(hero.hp, now)
        retireCharacter(hero)
        f.service.schedule(hero, now)
        f.navigation.grid.solid.fill(true)
        f.service.update(now + 30_000, f.context)
        expect(f.created).toHaveLength(0)
        const other = graveHero('blocker', CENTER_LOCATION_ID)
        f.characters.set(other.id, other)
        f.navigation.grid.solid.fill(false)
        const context = {
            ...f.context,
            occupants: () => [{ x: 152, y: 152, width: 48, height: 48 }],
        }
        f.service.update(now + 31_000, context)
        expect(f.created).toHaveLength(1)
        const skeleton = f.created[0]
        if (skeleton === undefined) {
            throw new Error('Missing skeleton')
        }
        expect(skeleton.character.position).not.toEqual(other.position)
        expect(
            Math.abs(skeleton.character.position.x - hero.position.x) >= 24 ||
                Math.abs(skeleton.character.position.y - hero.position.y) >= 24
        ).toBe(true)
        expect(skeleton.character).toBeInstanceOf(GameCharacter)
        expect(skeleton.controller).toBeInstanceOf(Mob1Controller)
        expect(skeleton.character.equipment.weapon?.itemId).toBe('old_sword')
        expect(skeleton.character.hp).toBe(skeleton.character.maxHp)
        skeleton.character.setMoveInput({ x: 1, y: 0 })
        const before = { ...skeleton.character.position }
        advanceCharacter({
            character: skeleton.character,
            navigation: f.navigation,
            now: now + 31_100,
            deltaMs: 100,
        })
        expect(skeleton.character.position.x).toBeGreaterThan(before.x)
    })
})
