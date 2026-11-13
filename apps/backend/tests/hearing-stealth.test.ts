import type {
    GroundSurface,
    MovementMode,
    Vector2,
} from '@my-game-ratata/contracts'
import { describe, expect, it, vi } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { Mob1Controller } from '../src/game/controllers'
import { lastHeardPoint, recordMovementNoise } from '../src/game/hearing'
import { advanceCharacter } from '../src/game/movement'
import { handleMovementCommand } from '../src/game/movementActions'
import type { MovementNoise } from '../src/game/movementNoise'
import { NavigationService } from '../src/game/navigation'
import { findVisibleTarget } from '../src/game/queries'
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
