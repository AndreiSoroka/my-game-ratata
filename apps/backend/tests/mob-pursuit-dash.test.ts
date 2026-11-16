import {
    type GameEventPayload,
    MOVEMENT_RULES,
} from '@my-game-ratata/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { attemptAttack, resolvePendingAttackHit } from '../src/game/combat'
import { Mob1Controller } from '../src/game/controllers'
import { recordMovementNoise } from '../src/game/hearing'
import { distance } from '../src/game/math'
import { tryPursuitDash } from '../src/game/mobPursuit'
import { advanceCharacter } from '../src/game/movement'
import { NavigationService } from '../src/game/navigation'
import { findVisibleTarget } from '../src/game/queries'
import type { GameRoom } from '../src/game/room'

function fixture(archetype: 'slime' | 'skeleton' = 'skeleton') {
    const actor = new GameCharacter({
        id: 'hunter',
        nickname: 'Hunter',
        archetype,
        faction: 'monsters',
        controllerKind: 'mob1',
        spawnPosition: { x: 200, y: 200 },
    })
    const target = new GameCharacter({
        id: 'prey',
        nickname: 'Prey',
        archetype: 'human',
        faction: 'peaceful',
        controllerKind: 'network_player',
        spawnPosition: { x: 296, y: 200 },
    })
    const navigation = new NavigationService({
        id: 'dash-arena',
        width: 40,
        height: 40,
        tileWidth: 16,
        tileHeight: 16,
        solid: new Array<boolean>(1600).fill(false),
        solidLayerNames: [],
    })
    const characters = [actor, target]
    const events: GameEventPayload[] = []
    const context = (character: GameCharacter, now: number) => ({
        actor: character,
        targets: characters,
        now,
        tileSize: 16,
        respawnDelayMsFor: () => 60_000,
    })
    const room = {
        charactersFor: () => characters,
        getCharacter: (id: string) =>
            characters.find((character) => character.id === id),
        navigationFor: () => navigation,
        findVisibleTarget: (observer: GameCharacter, radius: number) =>
            findVisibleTarget(characters, navigation, observer, radius, 5_000),
        publishEvents: (next: GameEventPayload[]) => events.push(...next),
        requestAttack: (character: GameCharacter, now: number) =>
            events.push(...attemptAttack(context(character, now))),
    } as unknown as GameRoom
    const controller = new Mob1Controller(7, {
        fleeWhenThreatened: archetype === 'slime',
    })
    const step = (now: number, deltaMs = 50) => {
        controller.update(actor, room, now)
        advanceCharacter({ character: actor, navigation, now, deltaMs })
        advanceCharacter({ character: target, navigation, now, deltaMs })
        events.push(...resolvePendingAttackHit(context(actor, now)))
    }
    return {
        actor,
        target,
        characters,
        navigation,
        room,
        events,
        controller,
        step,
    }
}

afterEach(() => vi.restoreAllMocks())

describe('mob dash uses the common paid ability', () => {
    it.each(['skeleton', 'slime'] as const)(
        'makes %s close a gap using normal speed, timing, cooldown and an attack reserve',
        (archetype) => {
            const { actor, target, navigation } = fixture(archetype)
            actor.energy =
                MOVEMENT_RULES.dashEnergy +
                actor.config.resources.attackEnergyCost
            actor.setMoveInput({ x: -1, y: 0 })
            expect(tryPursuitDash(actor, target, navigation, 5_000)).toEqual([
                { kind: 'dash', actorId: actor.id },
            ])
            expect(actor.energy).toBe(actor.config.resources.attackEnergyCost)
            expect(actor.movement.dashDirection).toEqual({ x: 1, y: 0 })
            expect(actor.movement.dashUntil).toBe(
                5_000 + MOVEMENT_RULES.dashDurationMs
            )
            expect(actor.movement.dashAvailableAt).toBe(
                5_000 + MOVEMENT_RULES.dashCooldownMs
            )
            const endsAt = 5_000 + MOVEMENT_RULES.dashDurationMs
            for (let now = 5_050; now <= endsAt; now += 50) {
                advanceCharacter({
                    character: actor,
                    navigation,
                    now,
                    deltaMs: 50,
                })
            }
            expect(actor.position.x - 200).toBeCloseTo(
                actor.config.moveSpeed *
                    MOVEMENT_RULES.dashSpeedMultiplier *
                    (MOVEMENT_RULES.dashDurationMs / 1_000)
            )
            expect(actor.position.x).toBeLessThan(target.position.x - 16)
            expect(actor.canSpendAttackResources()).toBe(true)
            expect(actor.energy).toBe(actor.config.resources.attackEnergyCost)
        }
    )

    it('cannot repeat before the exact shared cooldown boundary even with enough remaining energy', () => {
        const { actor, target, navigation } = fixture()
        const initial = actor.energy
        tryPursuitDash(actor, target, navigation, 5_000)
        const availableAt = 5_000 + MOVEMENT_RULES.dashCooldownMs
        expect(
            tryPursuitDash(actor, target, navigation, availableAt - 1)
        ).toEqual([])
        expect(actor.energy).toBe(initial - MOVEMENT_RULES.dashEnergy)
        expect(
            tryPursuitDash(actor, target, navigation, availableAt)
        ).toHaveLength(1)
        expect(actor.energy).toBe(initial - MOVEMENT_RULES.dashEnergy * 2)
    })

    it('only dashes with a braking tile beyond its projected end', () => {
        const { actor, target, navigation } = fixture()
        const minimum =
            (actor.config.moveSpeed *
                MOVEMENT_RULES.dashSpeedMultiplier *
                MOVEMENT_RULES.dashDurationMs) /
                1_000 +
            16
        target.position.x = actor.position.x + minimum - 1
        expect(tryPursuitDash(actor, target, navigation, 5_000)).toEqual([])
        target.position.x += 1
        expect(tryPursuitDash(actor, target, navigation, 5_000)).toHaveLength(1)
    })
})

describe('pursuit dash respects physical perception and action availability', () => {
    it.each([
        'dead actor',
        'offline actor',
        'stunned',
        'locked',
        'human control',
        'low energy',
        'near target',
        'distant target',
        'dead target',
        'offline target',
        'different map',
        'wall',
        'hidden sneak',
        'peaceful actor',
    ] as const)(
        'rejects %s without draining energy or rewriting the controller path',
        (reason) => {
            const { actor, target, navigation } = fixture()
            actor.setPath([{ x: 200, y: 240 }])
            if (reason === 'dead actor') {
                actor.alive = false
            }
            if (reason === 'offline actor') {
                actor.tags.add('offline')
            }
            if (reason === 'stunned') {
                actor.stunUntil = 6_000
            }
            if (reason === 'locked') {
                actor.lockAction(5_000, 1_000)
            }
            if (reason === 'human control') {
                actor.soul.controlSource = 'human'
            }
            if (reason === 'low energy') {
                actor.energy =
                    MOVEMENT_RULES.dashEnergy +
                    actor.config.resources.attackEnergyCost -
                    1
            }
            if (reason === 'near target') {
                target.position.x = 220
            }
            if (reason === 'distant target') {
                target.position.x = 400
            }
            if (reason === 'dead target') {
                target.alive = false
            }
            if (reason === 'offline target') {
                target.tags.add('offline')
            }
            if (reason === 'different map') {
                target.locationId = 'elsewhere'
            }
            if (reason === 'wall') {
                navigation.grid.solid[12 * 40 + 15] = true
            }
            if (reason === 'hidden sneak') {
                target.movement.mode = 'sneaking'
            }
            if (reason === 'peaceful actor') {
                Object.assign(actor, { faction: 'peaceful' })
            }
            const energy = actor.energy
            const path = [...actor.path]
            expect(tryPursuitDash(actor, target, navigation, 5_000)).toEqual([])
            expect(actor.energy).toBe(energy)
            expect(actor.path).toEqual(path)
            expect(actor.movement.dashAvailableAt).toBe(0)
        }
    )

    it('rejects a diagonal collision corner even if the sight ray itself is clear', () => {
        const { actor, target, navigation } = fixture()
        actor.position = { x: 207, y: 207 }
        target.position = { x: 277, y: 277 }
        navigation.grid.solid[12 * 40 + 13] = true
        navigation.grid.solid[13 * 40 + 12] = true
        expect(navigation.hasLineOfSight(actor.position, target.position)).toBe(
            true
        )
        expect(tryPursuitDash(actor, target, navigation, 5_000)).toEqual([])
        expect(actor.movement.dashUntil).toBe(0)
    })
})

describe('controller pursuit integration', () => {
    it.each(['skeleton', 'slime'] as const)(
        'lets %s catch up to a retreating player, then use ordinary melee without repeated dash spending',
        (archetype) => {
            vi.spyOn(Math, 'random').mockReturnValue(0.5)
            const {
                actor,
                target,
                controller,
                room,
                navigation,
                events,
                step,
            } = fixture(archetype)
            const before = distance(actor.position, target.position)
            const energy = actor.energy
            target.setMoveInput({ x: 1, y: 0 })
            controller.update(actor, room, 5_000)
            const endsAt = 5_000 + MOVEMENT_RULES.dashDurationMs
            for (let now = 5_050; now <= endsAt; now += 50) {
                step(now)
            }
            const gainedDistance =
                (actor.config.moveSpeed * MOVEMENT_RULES.dashSpeedMultiplier -
                    target.config.moveSpeed) *
                (MOVEMENT_RULES.dashDurationMs / 1_000)
            expect(gainedDistance).toBeGreaterThan(0)
            expect(distance(actor.position, target.position)).toBeCloseTo(
                before - gainedDistance
            )
            expect(actor.position.x).toBeLessThan(target.position.x)
            expect(actor.energy).toBe(energy - MOVEMENT_RULES.dashEnergy)
            expect(
                events.filter((event) => event.kind === 'dash')
            ).toHaveLength(1)
            target.setMoveInput({ x: 0, y: 0 })
            for (let now = endsAt + 50; now <= endsAt + 1_600; now += 50) {
                step(now)
            }
            expect(
                events.some(
                    (event) =>
                        event.kind === 'damage' && event.targetId === target.id
                )
            ).toBe(true)
            expect(
                events.filter((event) => event.kind === 'dash')
            ).toHaveLength(1)
            expect(
                navigation.isSolidTile(navigation.worldToTile(actor.position))
            ).toBe(false)
        }
    )

    it('investigates a heard location without dashing at an unseen actor', () => {
        const {
            actor,
            target,
            characters,
            navigation,
            room,
            controller,
            events,
        } = fixture()
        target.position.x = 360
        recordMovementNoise(
            room,
            {
                actorId: target.id,
                locationId: target.locationId,
                position: { ...target.position },
                emittedAt: 5_000,
                radius: 200,
                surface: 'stone',
            },
            characters
        )
        target.position.x = 500
        controller.update(actor, room, 5_000)
        expect(actor.movement.dashUntil).toBe(0)
        expect(events).toEqual([])
        expect(
            navigation.worldToTile(actor.path.at(-1) ?? actor.position)
        ).toEqual(navigation.worldToTile({ x: 360, y: 200 }))
    })

    it('keeps a weakened slime fleeing instead of spending its escape energy on pursuit', () => {
        const { actor, target, controller, room, events } = fixture('slime')
        actor.hp = 1
        target.position.x = 272
        controller.update(actor, room, 5_000)
        expect(actor.path.at(-1)?.x).toBeLessThan(actor.position.x)
        expect(actor.movement.dashUntil).toBe(0)
        expect(events).toEqual([])
    })
})

describe('pursuit remains forward after dash completion', () => {
    it.each([
        { archetype: 'skeleton' as const, deltaMs: 50 },
        { archetype: 'slime' as const, deltaMs: 50 },
        { archetype: 'skeleton' as const, deltaMs: 51 },
        { archetype: 'slime' as const, deltaMs: 51 },
    ])(
        'never backtracks along a pre-dash waypoint for $archetype at $deltaMs ms ticks',
        ({ archetype, deltaMs }) => {
            vi.spyOn(Math, 'random').mockReturnValue(0.5)
            const { actor, target, controller, room, step, events } =
                fixture(archetype)
            controller.update(actor, room, 5_000)
            let previousDistance = distance(actor.position, target.position)
            const samples: number[] = []
            const observeUntil = 5_000 + MOVEMENT_RULES.dashDurationMs + 1_000
            for (
                let now = 5_000 + deltaMs;
                now <= observeUntil;
                now += deltaMs
            ) {
                step(now, deltaMs)
                const currentDistance = distance(
                    actor.position,
                    target.position
                )
                samples.push(currentDistance)
                expect(
                    currentDistance,
                    `Pursuit gap increased at ${String(now)}: ${samples.join(', ')}`
                ).toBeLessThanOrEqual(previousDistance + 0.001)
                previousDistance = currentDistance
            }
            expect(
                events.filter((event) => event.kind === 'dash')
            ).toHaveLength(1)
            expect(events.some((event) => event.kind === 'attack')).toBe(true)
        }
    )
})
