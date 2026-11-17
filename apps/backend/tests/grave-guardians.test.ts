import {
    GRAVE_SPAWN_INTERVAL_MS,
    PURSUIT_RULES,
} from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { GraveSpawns } from '../src/game/graveSpawns'
import { advancePursuit } from '../src/game/pursuit'
import { pursuits, territories } from '../src/game/pursuitState'
import { createSkeleton } from '../src/game/spawns'
import { graveFixture } from './graveTestHelpers'
import { pursuitFixture } from './pursuitTestHelpers'

it('keeps exactly one stable living own child as guardian; replacement never creates a child', () => {
    const f = graveFixture()
    const first = createSkeleton(f.navigation, '_one', { x: 10, y: 10 }, 'none')
    const second = createSkeleton(
        f.navigation,
        '_two',
        { x: 12, y: 10 },
        'none'
    )
    f.context.add(first)
    f.context.add(second)
    const source = {
        id: 'guarded',
        locationId: first.character.locationId,
        position: { x: 168, y: 168 },
    }
    f.service.register(source, [first.character.id, second.character.id], 0)
    f.service.assignGuardians(f.characters)
    expect(territories.get(first.character)?.sourceId).toBe('guarded')
    expect(territories.has(second.character)).toBe(false)
    first.character.position.x += 40
    second.character.position.x = 168
    f.service.update(1000, f.context)
    expect(territories.has(first.character)).toBe(true)
    first.character.applyDamage(first.character.hp, 1001)
    f.service.update(1002, f.context)
    expect(territories.has(first.character)).toBe(false)
    expect(territories.get(second.character)?.sourceId).toBe('guarded')
    expect(f.created).toHaveLength(2)
    second.character.applyDamage(second.character.hp, 1003)
    f.service.update(1004, f.context)
    expect(territories.has(second.character)).toBe(false)
    expect(f.created).toHaveLength(2)
    f.service.update(GRAVE_SPAWN_INTERVAL_MS, f.context)
    const born = f.created.at(-1)
    if (born === undefined) {
        throw new Error('Missing normal scheduled birth')
    }
    expect(f.created).toHaveLength(3)
    expect(territories.get(born.character)?.sourceId).toBe('guarded')
})

it('retains its guardian while ruined, releases it immediately on purification, and never respawns purified children', () => {
    const f = graveFixture()
    const child = createSkeleton(f.navigation, '_one', { x: 10, y: 10 }, 'none')
    f.context.add(child)
    f.service.register(
        {
            id: 'g',
            locationId: child.character.locationId,
            position: { ...child.character.position },
        },
        [child.character.id],
        0
    )
    f.service.assignGuardians(f.characters)
    f.service.damage('g', 100, 100)
    f.service.update(101, f.context)
    expect(territories.has(child.character)).toBe(true)
    expect(child.character.tags.has('grave.guardian')).toBe(true)
    f.service.purify('g', 102)
    expect(territories.has(child.character)).toBe(false)
    expect(child.character.tags.has('grave.guardian')).toBe(false)
    expect(child.character.alive).toBe(true)
    f.service.update(GRAVE_SPAWN_INTERVAL_MS * 8, f.context)
    expect(f.created).toHaveLength(1)
})

it('patrols within 64px and defends without chasing beyond 160px on its home map', () => {
    const f = pursuitFixture()
    const service = new GraveSpawns()
    service.register(
        {
            id: 'g',
            locationId: f.actor.locationId,
            position: { ...f.actor.position },
        },
        [f.actor.id],
        0
    )
    service.assignGuardians(new Map([[f.actor.id, f.actor]]))
    f.target.tags.add('offline')
    for (let step = 0; step < 1_500; step++) {
        f.step()
        expect(
            Math.hypot(
                f.actor.position.x - f.actor.spawnPosition.x,
                f.actor.position.y - f.actor.spawnPosition.y
            )
        ).toBeLessThanOrEqual(PURSUIT_RULES.guardianPatrolRadius)
    }
    f.target.tags.delete('offline')
    f.target.position = { x: f.actor.position.x + 8, y: f.actor.position.y }
    f.controller.update(f.actor, f.room, f.now())
    const source = territories.get(f.actor)
    if (source === undefined) {
        throw new Error('Missing territory')
    }
    f.actor.position = { x: source.position.x - 152, y: source.position.y }
    f.target.position = { x: source.position.x - 168, y: source.position.y }
    expect(advancePursuit(f.actor, f.target, f.room, f.now()).returning).toBe(
        true
    )
    expect(pursuits.get(f.actor)?.phase).toBe('return')
})

it.each([
    { x: -1, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: -1 },
    { x: 0, y: 1 },
])(
    'keeps an idle guardian on its home map at the $x,$y border',
    (direction) => {
        const f = pursuitFixture({ direction })
        const navigation = f.room.navigationFor(f.actor)
        const { worldWidth, worldHeight } = navigation.summary
        const home = {
            x: direction.x < 0 ? 24 : direction.x > 0 ? worldWidth - 24 : 248,
            y: direction.y < 0 ? 24 : direction.y > 0 ? worldHeight - 24 : 248,
        }
        f.actor.position = { ...home }
        f.target.tags.add('offline')
        const service = new GraveSpawns()
        service.register(
            { id: 'edge', locationId: f.actor.locationId, position: home },
            [f.actor.id],
            0
        )
        service.assignGuardians(new Map([[f.actor.id, f.actor]]))
        for (let step = 0; step < 3_000; step++) {
            f.step()
            expect(f.actor.locationId).toBe(f.actor.spawnLocationId)
            expect(
                Math.hypot(
                    f.actor.position.x - home.x,
                    f.actor.position.y - home.y
                )
            ).toBeLessThanOrEqual(PURSUIT_RULES.guardianPatrolRadius)
        }
        expect(pursuits.has(f.actor)).toBe(false)
    }
)

it('lets a released guardian cross the border after its grave is purified', () => {
    const f = pursuitFixture()
    f.target.tags.add('offline')
    const service = new GraveSpawns()
    service.register(
        {
            id: 'released',
            locationId: f.actor.locationId,
            position: { ...f.actor.position },
        },
        [f.actor.id],
        0
    )
    service.assignGuardians(new Map([[f.actor.id, f.actor]]))
    expect(service.purify('released', f.now())).toBe(true)
    expect(territories.has(f.actor)).toBe(false)
    f.actor.setMoveInput(f.direction)
    for (
        let step = 0;
        step < 80 && f.actor.locationId === f.actor.spawnLocationId;
        step++
    ) {
        f.step(() => undefined)
    }
    expect(f.actor.locationId).toBe('map-2-1')
    expect(f.actor.alive).toBe(true)
    expect(pursuits.has(f.actor)).toBe(false)
})

it('allows a guardian near the border one bounded neighboring-map pursuit and returns it to the grave', () => {
    const f = pursuitFixture()
    const service = new GraveSpawns()
    service.register(
        {
            id: 'g',
            locationId: f.actor.locationId,
            position: { ...f.actor.position },
        },
        [f.actor.id],
        0
    )
    service.assignGuardians(new Map([[f.actor.id, f.actor]]))
    f.target.setMoveInput(f.direction)
    for (
        let step = 0;
        step < 80 && f.actor.locationId === f.actor.spawnLocationId;
        step++
    ) {
        f.step()
    }
    expect(f.actor.locationId).toBe('map-2-1')
    expect(pursuits.get(f.actor)?.foreign).toBeDefined()
    f.target.tags.add('offline')
    for (let step = 0; step < 160 && pursuits.has(f.actor); step++) {
        f.step()
    }
    expect(f.actor.locationId).toBe(f.actor.spawnLocationId)
    expect(
        Math.hypot(
            f.actor.position.x - f.actor.spawnPosition.x,
            f.actor.position.y - f.actor.spawnPosition.y
        )
    ).toBeLessThanOrEqual(24)
    expect(territories.get(f.actor)?.sourceId).toBe('g')
})

it('returns to a walkable point within 24px even when the grave occupies its anchor tile', () => {
    const f = pursuitFixture()
    const source = {
        id: 'g',
        locationId: f.actor.locationId,
        position: { ...f.actor.position },
    }
    f.actor.position.x -= 160
    f.target.tags.add('offline')
    const navigation = f.room.navigationFor(f.actor)
    const tile = navigation.worldToTile(source.position)
    navigation.grid.solid[tile.y * navigation.grid.width + tile.x] = true
    const service = new GraveSpawns()
    service.register(source, [f.actor.id], 0)
    service.assignGuardians(new Map([[f.actor.id, f.actor]]))
    for (let step = 0; step < 180 && pursuits.has(f.actor); step++) {
        f.step()
    }
    expect(pursuits.has(f.actor)).toBe(false)
    expect(
        Math.hypot(
            f.actor.position.x - source.position.x,
            f.actor.position.y - source.position.y
        )
    ).toBeLessThanOrEqual(24)
    expect(
        navigation.isSolidTile(navigation.worldToTile(f.actor.position))
    ).toBe(false)
})

it('assigns an already traveling living child and brings it back without spawning or teleporting', () => {
    const f = pursuitFixture()
    f.target.setMoveInput(f.direction)
    for (
        let step = 0;
        step < 80 && f.actor.locationId === f.actor.spawnLocationId;
        step++
    ) {
        f.step()
    }
    const service = new GraveSpawns()
    service.register(
        {
            id: 'g',
            locationId: f.actor.spawnLocationId,
            position: { ...f.actor.spawnPosition },
        },
        [f.actor.id],
        0
    )
    const before = { ...f.actor.position }
    service.assignGuardians(new Map([[f.actor.id, f.actor]]))
    expect(f.actor.position).toEqual(before)
    expect(f.actor.locationId).toBe('map-2-1')
    f.target.tags.add('offline')
    for (let step = 0; step < 180 && pursuits.has(f.actor); step++) {
        f.step()
    }
    expect(f.actor.locationId).toBe(f.actor.spawnLocationId)
    expect(territories.get(f.actor)?.sourceId).toBe('g')
})
