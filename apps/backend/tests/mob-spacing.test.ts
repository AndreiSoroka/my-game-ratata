import type { GameEventPayload, Vector2 } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { attemptAttack, resolvePendingAttackHit } from '../src/game/combat'
import { Mob1Controller } from '../src/game/controllers'
import { distance } from '../src/game/math'
import { MobSpacing } from '../src/game/mobSpacing'
import { advanceCharacter } from '../src/game/movement'
import { NavigationService } from '../src/game/navigation'
import { findVisibleTarget } from '../src/game/queries'
import type { GameRoom } from '../src/game/room'
import { createSkeleton, createSlime } from '../src/game/spawns'

function mob(
    id: string,
    position: Vector2,
    archetype: 'skeleton' | 'slime' = 'skeleton'
) {
    return new GameCharacter({
        id,
        nickname: id,
        archetype,
        controllerKind: 'mob1',
        faction: 'monsters',
        locationId: 'map-3-2',
        spawnPosition: position,
    })
}

function arena() {
    return new NavigationService({
        id: 'spacing',
        width: 30,
        height: 30,
        tileWidth: 16,
        tileHeight: 16,
        solidLayerNames: [],
        solid: Array<boolean>(900).fill(false),
    })
}

describe('mob crowd avoidance uses ordinary movement', () => {
    it.each([
        { archetype: 'skeleton', count: 2 },
        { archetype: 'skeleton', count: 3 },
        { archetype: 'slime', count: 2 },
        { archetype: 'slime', count: 3 },
    ] as const)(
        'separates $count overlapping $archetype mobs chasing the same enemy and all still attack',
        ({ archetype, count }) => {
            const navigation = arena()
            const first = mob('mob-a', { x: 80, y: 80 }, archetype)
            const second = mob('mob-b', { x: 80, y: 80 }, archetype)
            const mobs = [
                first,
                second,
                ...(count === 3
                    ? [mob('mob-c', { x: 80, y: 80 }, archetype)]
                    : []),
            ]
            const target = new GameCharacter({
                id: 'target',
                nickname: 'Target',
                archetype: 'human',
                controllerKind: 'network_player',
                faction: 'peaceful',
                locationId: first.locationId,
                spawnPosition: { x: 152, y: 80 },
            })
            target.maxHp = target.hp = 1000
            const characters = [...mobs, target]
            const controllers = mobs.map((actor) => ({
                actor,
                controller: new Mob1Controller(1),
            }))
            const events: GameEventPayload[] = []
            let now = 5000
            const context = (actor: GameCharacter) => ({
                actor,
                now,
                navigation,
                targets: characters,
                tileSize: 16,
                random: () => 0.9,
                respawnDelayMsFor: () => 15000,
            })
            const room = {
                navigationFor: () => navigation,
                charactersFor: () => characters,
                getCharacter: (id: string) =>
                    characters.find((actor) => actor.id === id),
                findVisibleTarget: (actor: GameCharacter, radius: number) =>
                    findVisibleTarget(
                        characters,
                        navigation,
                        actor,
                        radius,
                        now
                    ),
                requestScavenge: () => false,
                publishEvents: (next: GameEventPayload[]) =>
                    events.push(...next),
                requestAttack: (actor: GameCharacter) =>
                    events.push(...attemptAttack(context(actor))),
            } as unknown as GameRoom
            controllers.forEach(({ controller, actor }) =>
                controller.update(actor, room, now)
            )
            expect(first.position).toEqual(second.position)
            expect(first.remainingPath()).not.toEqual(second.remainingPath())
            for (; now < 15000; now += 50) {
                controllers.forEach(({ controller, actor }) =>
                    controller.update(actor, room, now)
                )
                for (const actor of mobs) {
                    advanceCharacter({
                        character: actor,
                        navigation,
                        now,
                        deltaMs: 50,
                    })
                    events.push(...resolvePendingAttackHit(context(actor)))
                }
            }
            for (const [index, actor] of mobs.entries()) {
                for (const other of mobs.slice(index + 1)) {
                    expect(
                        distance(actor.position, other.position)
                    ).toBeGreaterThanOrEqual(15)
                }
                expect(events).toContainEqual(
                    expect.objectContaining({
                        kind: 'damage',
                        actorId: actor.id,
                        targetId: target.id,
                    })
                )
            }
        }
    )
})

describe('mob crowd avoidance respects available space and life state', () => {
    it.each([createSkeleton, createSlime])(
        'gives distinct spawned mobs independent wandering choices',
        (create) => {
            const navigation = arena()
            const room = {
                navigationFor: () => navigation,
                charactersFor: () => [],
                findVisibleTarget: () => undefined,
                getCharacter: () => undefined,
                requestScavenge: () => false,
            } as unknown as GameRoom
            const paths = Array.from({ length: 8 }, (_, index) => {
                const spawn = create(navigation, `_${String(index)}`)
                spawn.controller.update(spawn.character, room, 5000)
                return JSON.stringify(spawn.character.remainingPath())
            })
            expect(new Set(paths).size).toBeGreaterThan(1)
        }
    )
    it('avoids a shared waypoint before entering an ally and never relocates either actor directly', () => {
        const navigation = arena()
        const leader = mob('a', { x: 96, y: 80 })
        const follower = mob('b', { x: 80, y: 80 })
        follower.setPath([{ x: 120, y: 80 }])
        expect(
            new MobSpacing().update(
                follower,
                [leader, follower],
                navigation,
                5000
            )
        ).toBe(true)
        expect(follower.position).toEqual({ x: 80, y: 80 })
        expect(leader.position).toEqual({ x: 96, y: 80 })
        const waypoint = follower.nextPathPoint()
        if (waypoint === undefined) {
            throw new Error('Expected a side-step path')
        }
        expect(distance(waypoint, leader.position)).toBeGreaterThanOrEqual(16)
        advanceCharacter({
            character: follower,
            navigation,
            now: 5050,
            deltaMs: 50,
        })
        expect(follower.position).not.toEqual({ x: 80, y: 80 })
    })

    it('chooses free land beside a crowd without crossing a wall or water tile', () => {
        const navigation = arena()
        navigation.grid.solid.fill(true)
        for (let y = 4; y <= 8; y += 1) {
            navigation.grid.solid[y * 30 + 5] = false
        }
        const first = mob('a', { x: 88, y: 88 })
        const second = mob('b', { x: 88, y: 88 })
        expect(
            new MobSpacing().update(second, [first, second], navigation, 5000)
        ).toBe(true)
        const point = second.nextPathPoint()
        if (point === undefined) {
            throw new Error('Expected a walkable side-step')
        }
        expect(point.x).toBe(88)
        expect(navigation.hasLineOfSight(second.position, point)).toBe(true)
        for (let now = 5050; now <= 5600; now += 50) {
            advanceCharacter({
                character: second,
                navigation,
                now,
                deltaMs: 50,
            })
        }
        expect(
            navigation.isSolidTile(navigation.worldToTile(second.position))
        ).toBe(false)
        expect(
            distance(first.position, second.position)
        ).toBeGreaterThanOrEqual(16)
    })

    it.each(['dead', 'offline', 'other-location'] as const)(
        'ignores an unavailable %s peer',
        (reason) => {
            const first = mob('a', { x: 80, y: 80 })
            const second = mob('b', { x: 80, y: 80 })
            if (reason === 'dead') {
                first.applyDamage(first.hp, 4000)
            }
            if (reason === 'offline') {
                first.tags.add('offline')
            }
            if (reason === 'other-location') {
                first.locationId = 'map-4-2'
            }
            expect(
                new MobSpacing().update(second, [first, second], arena(), 5000)
            ).toBe(false)
            expect(second.hasPath()).toBe(false)
        }
    )
})
