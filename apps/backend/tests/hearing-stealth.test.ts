import type {
    GameEventPayload,
    GroundSurface,
    MovementMode,
    Vector2,
} from '@my-game-ratata/contracts'
import { describe, expect, it, vi } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { isLegalAttackTarget } from '../src/game/combat'
import { prepareTarget } from '../src/game/combatAttackTarget'
import { observeCombatEvent } from '../src/game/combatEventObservation'
import { Mob1Controller } from '../src/game/controllers'
import {
    heardFootsteps,
    lastHeardPoint,
    recordMovementNoise,
} from '../src/game/hearing'
import { advanceCharacter } from '../src/game/movement'
import { handleMovementCommand } from '../src/game/movementActions'
import type { MovementNoise } from '../src/game/movementNoise'
import { NavigationService } from '../src/game/navigation'
import { createSnapshot, findVisibleTarget } from '../src/game/queries'
import type { GameRoom } from '../src/game/room'

function character(id: string, point: Vector2, hostile = false): GameCharacter {
    return new GameCharacter({
        id,
        nickname: id,
        archetype: hostile ? 'skeleton' : 'human',
        controllerKind: hostile ? 'mob1' : 'network_player',
        faction: hostile ? 'monsters' : 'peaceful',
        locationId: 'map-2-1',
        spawnPosition: point,
    })
}
function setup(surface: GroundSurface = 'grass') {
    const listener = character('listener', { x: 200, y: 200 }, true)
    const source = character('source', { x: 360, y: 200 })
    const characters = [listener, source]
    const navigation = new NavigationService({
        id: 'sound-test',
        width: 50,
        height: 50,
        tileWidth: 16,
        tileHeight: 16,
        solid: new Array<boolean>(2500).fill(false),
        solidLayerNames: [],
        surfaces: new Array<GroundSurface>(2500).fill(surface),
    })
    const attacks = vi.fn()
    const room = {
        getCharacter: (id: string) =>
            characters.find((actor) => actor.id === id),
        navigationFor: () => navigation,
        charactersFor: () => characters,
        findVisibleTarget: (actor: GameCharacter, radius: number) =>
            findVisibleTarget(characters, navigation, actor, radius, 1_200),
        requestAttack: attacks,
    } as unknown as GameRoom
    const noises: MovementNoise[] = []
    const step = (now: number, deltaMs: number): void => {
        advanceCharacter({
            character: source,
            navigation,
            now,
            deltaMs,
            onNoise: (noise) => {
                noises.push(noise)
                recordMovementNoise(room, noise, characters)
            },
        })
    }
    return {
        listener,
        source,
        characters,
        navigation,
        room,
        attacks,
        noises,
        step,
    }
}
function moving(mode: MovementMode, surface: GroundSurface = 'grass') {
    const fixture = setup(surface)
    handleMovementCommand(
        fixture.source,
        { type: 'movement_mode', mode },
        1_000
    )
    fixture.source.setMoveInput({ x: -1, y: 0 })
    return fixture
}

function dashing(surface: GroundSurface = 'grass') {
    const fixture = moving('walking', surface)
    fixture.source.position.x = 400
    handleMovementCommand(fixture.source, { type: 'dash' }, 1_000)
    return fixture
}

describe('authoritative footsteps and hearing', () => {
    it('hears a dash outside sight and investigates a fixed point instead of tracking the hidden actor', () => {
        const { source, listener, room, step, noises, navigation, attacks } =
            dashing()
        step(1_200, 200)
        expect(noises).toHaveLength(1)
        expect(room.findVisibleTarget(listener, 112)).toBeUndefined()
        const heard = { ...source.position }
        expect(lastHeardPoint(listener, room, 1_200)).toEqual(heard)
        source.position = { x: 500, y: 400 }
        const controller = new Mob1Controller(3, { fleeWhenThreatened: false })
        controller.update(listener, room, 1_200)
        expect(
            navigation.worldToTile(listener.path.at(-1) ?? listener.position)
        ).toEqual(navigation.worldToTile(heard))
        source.position = { x: 600, y: 300 }
        controller.update(listener, room, 1_800)
        expect(lastHeardPoint(listener, room, 1_800)).toEqual(heard)
        expect(
            navigation.worldToTile(listener.path.at(-1) ?? listener.position)
        ).toEqual(navigation.worldToTile(heard))
        expect(attacks).not.toHaveBeenCalled()
        expect(lastHeardPoint(listener, room, 5_199)).toEqual(heard)
        expect(lastHeardPoint(listener, room, 5_200)).toBeUndefined()
    })
    it('lets a sneaking actor pass the same nearby observer without footsteps revealing them', () => {
        const { source, listener, room, step, noises } = moving('sneaking')
        for (let now = 1_200; now <= 2_000; now += 200) {
            step(now, 200)
        }
        expect(noises.length).toBeGreaterThan(0)
        expect(source.position.x).toBeCloseTo(319.5)
        expect(lastHeardPoint(listener, room, 2_000)).toBeUndefined()
        expect(room.findVisibleTarget(listener, 112)).toBeUndefined()
    })
    it('attenuates obstacles and distinguishes soft ground from a loud stone path', () => {
        for (const surface of ['grass', 'stone'] as const) {
            const { source, listener, navigation, room, step } =
                dashing(surface)
            source.position.x = 407.6
            navigation.grid.solid[12 * 50 + 16] = true
            step(1_200, 200)
            expect(room.findVisibleTarget(listener, 112)).toBeUndefined()
            expect(lastHeardPoint(listener, room, 1_200) !== undefined).toBe(
                surface === 'stone'
            )
        }
    })
    it('emits no idle, blocked, dead, offline, stunned or action-locked footsteps', () => {
        for (const reason of [
            'idle',
            'blocked',
            'dead',
            'offline',
            'stun',
            'locked',
        ]) {
            const { source, navigation, step, noises } = moving('walking')
            if (reason === 'idle') {
                source.setMoveInput({ x: 0, y: 0 })
            }
            if (reason === 'blocked') {
                source.position.x = 352.01
                for (let y = 0; y < 50; y += 1) {
                    navigation.grid.solid[y * 50 + 21] = true
                }
            }
            if (reason === 'dead') {
                source.alive = false
            }
            if (reason === 'offline') {
                source.tags.add('offline')
            }
            if (reason === 'stun') {
                source.stunUntil = 4_000
            }
            if (reason === 'locked') {
                source.lockAction(1_000, 3_000)
            }
            step(1_200, 200)
            step(1_400, 200)
            expect(noises, reason).toEqual([])
        }
    })
})

describe('hearing scope and lifetime', () => {
    it.each([
        { stars: [], distance: 1.5, moving: false, hears: false },
        { stars: ['hollow_sight'], distance: 1.5, moving: false, hears: true },
        {
            stars: ['hollow_sight', 'night_watch'],
            distance: 2.1,
            moving: true,
            hears: false,
        },
        {
            stars: ['hollow_sight', 'night_watch'],
            distance: 2.1,
            moving: false,
            hears: true,
        },
    ])(
        'uses the learned sneak-hearing range ($stars, moving $moving)',
        ({ stars, distance, moving: inMotion, hears }) => {
            const { source, listener, room, step, noises } = moving('sneaking')
            step(1200, 200)
            step(1400, 200)
            const noise = noises.at(-1)
            if (noise === undefined) {
                throw new Error('Expected a step from actual movement')
            }
            for (const star of stars) {
                listener.progression.constellations.opened.add(`undead.${star}`)
            }
            listener.position = {
                ...noise.position,
                x: noise.position.x + noise.radius * distance,
            }
            listener.velocity = { x: inMotion ? 20 : 0, y: 0 }
            recordMovementNoise(room, noise, [listener])
            expect(lastHeardPoint(listener, room, noise.emittedAt)).toEqual(
                hears ? noise.position : undefined
            )
            source.position.x += 100
            expect(lastHeardPoint(listener, room, noise.emittedAt)).toEqual(
                hears ? noise.position : undefined
            )
        }
    )

    it.each([
        'source-dead',
        'source-offline',
        'source-map',
        'listener-dead',
        'listener-offline',
        'listener-map',
    ] as const)('discards stale sound when %s', (reason) => {
        const { source, listener, room, step } = dashing()
        step(1_200, 200)
        expect(lastHeardPoint(listener, room, 1_200)).toBeDefined()
        const actor = reason.startsWith('source') ? source : listener
        if (reason.endsWith('dead')) {
            actor.alive = false
        }
        if (reason.endsWith('offline')) {
            actor.tags.add('offline')
        }
        if (reason.endsWith('map')) {
            actor.locationId = 'map-1-1'
        }
        expect(lastHeardPoint(listener, room, 1_201)).toBeUndefined()
    })
    it('only informs listeners present at the sound, never another room or another location', () => {
        const { source, listener, characters, room, step } = dashing()
        const distantMap = character(
            'other-map',
            { ...listener.position },
            true
        )
        distantMap.locationId = 'map-3-3'
        characters.push(distantMap)
        step(1_200, 200)
        const latecomer = character('latecomer', { ...listener.position }, true)
        const friend = character('friend', { ...source.position })
        characters.push(latecomer, friend)
        expect(lastHeardPoint(distantMap, room, 1_200)).toBeUndefined()
        expect(lastHeardPoint(latecomer, room, 1_200)).toBeUndefined()
        expect(lastHeardPoint(friend, room, 1_200)).toBeUndefined()
        expect(lastHeardPoint(listener, setup().room, 1_200)).toBeUndefined()
    })
    it('does not carry unfinished footstep distance across map transitions', () => {
        const { source, step, noises } = moving('walking')
        step(1_100, 100)
        expect(noises).toEqual([])
        source.locationId = 'map-3-2'
        step(1_200, 100)
        expect(noises).toEqual([])
        step(1_300, 100)
        expect(noises).toHaveLength(1)
        expect(noises[0]?.locationId).toBe('map-3-2')
    })
})

describe('stealth sight remains physical and directional', () => {
    it('reduces visibility more behind the observer, while close targets and recent attackers remain visible', () => {
        const { listener, source, navigation, characters } = setup()
        listener.facing = 'right'
        handleMovementCommand(
            source,
            { type: 'movement_mode', mode: 'sneaking' },
            1_000
        )
        source.position = { x: 260, y: 200 }
        expect(
            findVisibleTarget(characters, navigation, listener, 112, 1_200)
        ).toBe(source)
        source.position = { x: 140, y: 200 }
        expect(
            findVisibleTarget(characters, navigation, listener, 112, 1_200)
        ).toBeUndefined()
        source.position.x = 175
        expect(
            findVisibleTarget(characters, navigation, listener, 112, 1_200)
        ).toBe(source)
        source.position.x = 140
        source.lastAttackAt = 1_100
        expect(
            findVisibleTarget(characters, navigation, listener, 112, 1_200)
        ).toBe(source)
        expect(
            findVisibleTarget(characters, navigation, listener, 112, 2_100)
        ).toBeUndefined()
    })
    it('still rejects blocked sight, offline and cross-location bodies even at close range', () => {
        const { listener, source, navigation, characters } = setup()
        source.position = { x: 240, y: 200 }
        navigation.grid.solid[12 * 50 + 14] = true
        expect(
            findVisibleTarget(characters, navigation, listener, 112, 1_200)
        ).toBeUndefined()
        navigation.grid.solid[12 * 50 + 14] = false
        source.tags.add('offline')
        expect(
            findVisibleTarget(characters, navigation, listener, 112, 1_200)
        ).toBeUndefined()
        source.tags.delete('offline')
        source.locationId = 'map-0-0'
        expect(
            findVisibleTarget(characters, navigation, listener, 112, 1_200)
        ).toBeUndefined()
    })
})

describe('stealth in the player world view', () => {
    it.each([false, true])(
        'projects crouched characters by observer (NPC: %s)',
        (npc) => {
            const { source, listener, navigation } = setup()
            const croucher = npc ? listener : source
            croucher.position = { x: 140, y: 200 }
            croucher.movement.mode = 'sneaking'
            const approaching = character('approaching', { x: 200, y: 200 })
            const turnedAway = character('turned-away', approaching.position)
            approaching.facing = 'left'
            turnedAway.facing = 'right'
            const characters = [croucher, approaching, turnedAway]
            const view = (observer?: GameCharacter, now = 2_000) =>
                createSnapshot(
                    characters,
                    [],
                    [],
                    1,
                    now,
                    navigation,
                    observer?.id
                ).characters.find((entry) => entry.id === croucher.id)

            expect(view(approaching)).toMatchObject({
                movement: { mode: 'sneaking' },
            })
            expect(view(turnedAway)).toBeUndefined()
            expect(view()).toBeUndefined()
            expect(view(croucher)).toBeDefined()
            navigation.grid.solid[12 * 50 + 10] = true
            expect(view(approaching)).toBeUndefined()
            navigation.grid.solid[12 * 50 + 10] = false
            croucher.position.x = 173
            expect(view(turnedAway)).toBeDefined()

            croucher.position.x = 90
            expect(view(approaching)).toBeUndefined()
            croucher.lastAttackAt = 1_500
            expect(view(turnedAway, 2_499)).toBeDefined()
            expect(view(turnedAway, 2_500)).toBeUndefined()
            croucher.movement.mode = 'walking'
            expect(view(turnedAway, 2_500)).toBeDefined()
        }
    )

    it('rejects a hidden named attack before facing the target and preserves physical contact', () => {
        const { listener, source, navigation } = setup()
        listener.facing = 'right'
        source.position = { x: 140, y: 200 }
        source.movement.mode = 'sneaking'
        const context = {
            actor: listener,
            navigation,
            now: 2_000,
            respawnDelayMsFor: () => 0,
            targets: [source],
            tileSize: 16,
        }
        expect(prepareTarget({ ...context, targetId: source.id })).toBe(false)
        expect(listener.facing).toBe('right')
        expect(isLegalAttackTarget(listener, source, context)).toBe(true)
        listener.facing = 'left'
        expect(prepareTarget({ ...context, targetId: source.id })).toBe(true)
    })

    it('omits the hidden actor and any aim or origin information from public combat feedback', () => {
        const { listener, source, navigation, room } = setup()
        listener.facing = 'right'
        source.position = { x: 140, y: 200 }
        source.movement.mode = 'sneaking'
        const event: GameEventPayload = {
            kind: 'damage',
            actorId: source.id,
            targetId: listener.id,
            actionId: `${source.id}:1`,
            position: source.position,
            projectile: {
                origin: source.position,
                endpoint: listener.position,
            },
            attackGeometry: {
                kind: 'circle',
                center: source.position,
                radius: 64,
            },
        }
        const view = {
            observer: listener,
            navigation,
            getCharacter: room.getCharacter,
            now: 2_000,
        }
        expect(observeCombatEvent(event, view)).toEqual({
            kind: 'damage',
            targetId: listener.id,
        })
        expect(
            observeCombatEvent({ ...event, targetId: source.id }, view)
        ).toBeUndefined()
        expect(event.actorId).toBe(source.id)
    })
})

describe('heard player footsteps', () => {
    it('creates a short anonymous marker from real movement only for the player who hears a hidden step', () => {
        const { source, navigation, room, characters, step, noises } =
            moving('sneaking')
        source.position.x = 150
        const nearby = character('nearby', { x: 200, y: 200 })
        const inSight = character('in-sight', nearby.position)
        const outOfRange = character('out-of-range', { x: 300, y: 200 })
        const elsewhere = character('elsewhere', nearby.position)
        elsewhere.locationId = 'map-2-2'
        nearby.facing = 'right'
        inSight.facing = 'left'
        outOfRange.facing = 'right'
        elsewhere.facing = 'right'
        characters.push(nearby, inSight, outOfRange, elsewhere)
        source.setMoveInput({ x: 0, y: 0 })
        step(1_200, 200)
        expect(heardFootsteps(room, nearby, 1_200)).toEqual([])

        source.setMoveInput({ x: -1, y: 0 })
        step(1_400, 400)
        expect(noises).toHaveLength(1)
        const position = { x: 144, y: 208 }
        expect(heardFootsteps(room, nearby, 1_400)).toEqual([
            { id: 1, position, expiresAt: 2_250 },
        ])
        for (const observer of [inSight, outOfRange, elsewhere, source]) {
            expect(heardFootsteps(room, observer, 1_400)).toEqual([])
        }
        source.position.x -= 16
        expect(heardFootsteps(room, nearby, 2_249)).toEqual([
            { id: 1, position, expiresAt: 2_250 },
        ])
        const noise = noises[0]
        if (noise === undefined) {
            throw new Error('Expected a step from actual movement')
        }
        recordMovementNoise(room, { ...noise, emittedAt: 2_250 }, [nearby])
        expect(heardFootsteps(room, nearby, 2_250)).toEqual([])
        navigation.grid.solid[12 * 50 + 10] = true
        recordMovementNoise(room, { ...noise, emittedAt: 2_300 }, [nearby])
        expect(heardFootsteps(room, nearby, 2_300)).toEqual([])
        navigation.grid.solid[12 * 50 + 10] = false
        recordMovementNoise(room, { ...noise, emittedAt: 2_300 }, [nearby])
        expect(heardFootsteps(room, nearby, 2_300)).toEqual([
            { id: 2, position, expiresAt: 3_150 },
        ])
        source.position.x = 140
        nearby.facing = 'left'
        expect(heardFootsteps(room, nearby, 2_350)).toEqual([])
        nearby.facing = 'right'
        expect(heardFootsteps(room, nearby, 2_400)).toEqual([])
    })
})
