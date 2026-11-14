import {
    type GameEventPayload,
    type Vector2,
    WILDERNESS_AGGRO_POLICY,
} from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { attemptAttack, resolvePendingAttackHit } from '../src/game/combat'
import { Mob1Controller } from '../src/game/controllers'
import { coordinatedTarget } from '../src/game/mobAggro'
import { advanceCharacter } from '../src/game/movement'
import { NavigationService } from '../src/game/navigation'
import { findVisibleTarget } from '../src/game/queries'
import type { GameRoom } from '../src/game/room'

const directions = [
    { facing: 'right', offset: { x: 8, y: 0 } },
    { facing: 'left', offset: { x: -8, y: 0 } },
    { facing: 'down', offset: { x: 0, y: 8 } },
    { facing: 'up', offset: { x: 0, y: -8 } },
] as const

function fixture(
    archetype: 'skeleton' | 'slime',
    offset: Vector2 = { x: 8, y: 0 }
) {
    const actor = new GameCharacter({
        id: 'mob',
        nickname: 'Mob',
        archetype,
        controllerKind: 'mob1',
        faction: 'monsters',
        locationId: 'map-3-2',
        spawnPosition: { x: 256, y: 256 },
    })
    actor.position = { x: 656, y: 256 }
    const target = new GameCharacter({
        id: 'target',
        nickname: 'Target',
        archetype: 'human',
        controllerKind: 'network_player',
        faction: 'peaceful',
        locationId: actor.locationId,
        spawnPosition: {
            x: actor.position.x + offset.x,
            y: actor.position.y + offset.y,
        },
    })
    const characters = [actor, target]
    const navigation = new NavigationService({
        id: actor.locationId,
        width: 80,
        height: 60,
        tileWidth: 16,
        tileHeight: 16,
        solidLayerNames: [],
        solid: Array<boolean>(80 * 60).fill(false),
    })
    const controller = new Mob1Controller(1, {
        fleeWhenThreatened: archetype === 'slime',
    })
    let currentTime = 5000
    const events: GameEventPayload[] = []
    const context = (now: number) => ({
        actor,
        now,
        targets: characters,
        navigation,
        tileSize: 16,
        random: () => 0.9,
        respawnDelayMsFor: () => 15_000,
    })
    const room = {
        charactersFor: () => characters,
        getCharacter: (id: string) =>
            characters.find((character) => character.id === id),
        navigationFor: () => navigation,
        findVisibleTarget: (observer: GameCharacter, radius: number) =>
            findVisibleTarget(
                characters,
                navigation,
                observer,
                radius,
                currentTime
            ),
        requestScavenge: () => false,
        publishEvents: (next: GameEventPayload[]) => {
            events.push(...next)
        },
        requestAttack: (_actor: GameCharacter, now: number) => {
            events.push(...attemptAttack(context(now)))
        },
    } as unknown as GameRoom
    const step = (now: number) => {
        currentTime = now
        controller.update(actor, room, now)
        advanceCharacter({ character: actor, navigation, now, deltaMs: 25 })
        events.push(...resolvePendingAttackHit(context(now)))
    }
    const fight = () => {
        for (
            let now = 5000;
            now <= 7000 && target.hp === target.maxHp;
            now += 25
        ) {
            step(now)
        }
    }
    return { actor, target, navigation, room, step, fight, events }
}

describe.each(['skeleton', 'slime'] as const)(
    '%s direct combat beyond its original spawn area',
    (archetype) => {
        it.each(directions)(
            'turns $facing and resolves a real adjacent hit outside the 320px circle',
            ({ facing, offset }) => {
                const f = fixture(archetype, offset)
                expect(
                    Math.hypot(
                        f.actor.position.x - f.actor.spawnPosition.x,
                        f.actor.position.y - f.actor.spawnPosition.y
                    )
                ).toBeGreaterThan(WILDERNESS_AGGRO_POLICY.spawnLeashRadius)
                expect(coordinatedTarget(f.actor, f.room, 5000)).toBe(f.target)
                f.fight()
                expect(f.actor.facing).toBe(facing)
                expect(f.events).toContainEqual(
                    expect.objectContaining({
                        kind: 'attack',
                        actorId: f.actor.id,
                    })
                )
                expect(f.events).toContainEqual(
                    expect.objectContaining({
                        kind: 'damage',
                        actorId: f.actor.id,
                        targetId: f.target.id,
                    })
                )
                expect(f.target.hp).toBeLessThan(f.target.maxHp)
            }
        )
        it.each([319.9, 320, 320.1])(
            'does not create an attack immunity boundary at %spx from spawn',
            (distance) => {
                const f = fixture(archetype)
                f.target.position.x = f.actor.spawnPosition.x + distance
                f.actor.position.x = f.target.position.x - 8
                f.fight()
                expect(f.target.hp).toBeLessThan(f.target.maxHp)
            }
        )
        it('uses actual shared movement to close with a visible target outside the old circle, then damages it', () => {
            const f = fixture(archetype, { x: 72, y: 0 })
            const initialPosition = { ...f.actor.position }
            f.fight()
            expect(f.actor.position.x).toBeGreaterThan(initialPosition.x)
            expect(f.target.hp).toBeLessThan(f.target.maxHp)
        })
        it('uses current location coordinates after a wilderness crossing while retaining the original spawn reference', () => {
            const f = fixture(archetype)
            f.actor.locationId = 'map-4-2'
            f.target.locationId = f.actor.locationId
            expect(f.actor.spawnLocationId).toBe('map-3-2')
            f.fight()
            expect(f.target.hp).toBeLessThan(f.target.maxHp)
            expect(f.actor.spawnPosition).toEqual({ x: 256, y: 256 })
        })
    }
)

describe('local combat still requires real perception', () => {
    it.each(['wall', 'hidden', 'offline', 'dead', 'other-location'] as const)(
        'does not acquire or attack a %s target outside the old spawn area',
        (reason) => {
            const f = fixture('skeleton')
            if (reason === 'offline') {
                f.target.tags.add('offline')
            }
            if (reason === 'dead') {
                f.target.applyDamage(f.target.hp, 4000)
            }
            if (reason === 'other-location') {
                f.target.locationId = 'map-4-2'
            }
            if (reason === 'wall') {
                f.target.position.x = f.actor.position.x + 32
                f.navigation.grid.solid[16 * 80 + 42] = true
            }
            if (reason === 'hidden') {
                f.actor.facing = 'right'
                f.target.position.x = f.actor.position.x - 80
                f.target.movement.mode = 'sneaking'
            }
            const hp = f.target.hp
            expect(coordinatedTarget(f.actor, f.room, 5000)).toBeUndefined()
            f.step(5000)
            f.step(5050)
            expect(
                f.events.some(
                    (event) =>
                        event.kind === 'attack' || event.kind === 'damage'
                )
            ).toBe(false)
            expect(f.target.hp).toBe(hp)
        }
    )
    it('loses direct acquisition when the target moves beyond sight instead of tracking live distant coordinates', () => {
        const f = fixture('skeleton')
        expect(coordinatedTarget(f.actor, f.room, 5000)).toBe(f.target)
        f.target.position.x =
            f.actor.position.x + WILDERNESS_AGGRO_POLICY.sightRadius + 1
        expect(coordinatedTarget(f.actor, f.room, 5100)).toBeUndefined()
        f.step(5100)
        expect(f.events).toEqual([])
        expect(
            f.actor.remainingPath().at(-1)?.x ?? f.actor.position.x
        ).toBeLessThan(f.target.position.x)
    })
})
