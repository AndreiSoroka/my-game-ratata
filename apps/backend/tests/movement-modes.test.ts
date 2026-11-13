import { MOVEMENT_RULES, type Vector2 } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import {
    applyAgentDecision,
    parseAgentDecision,
} from '../src/game/agentDecisions'
import { GameCharacter } from '../src/game/character'
import { CompanionService } from '../src/game/companions'
import { parseClientMessage } from '../src/game/messages'
import { advanceCharacter } from '../src/game/movement'
import { handleMovementCommand } from '../src/game/movementActions'
import type { MovementNoise } from '../src/game/movementNoise'
import { NavigationService } from '../src/game/navigation'
import { readNavigationSurfaces } from '../src/game/navigationSurfaces'

function navigation(): NavigationService {
    return new NavigationService({
        id: 'test',
        width: 40,
        height: 40,
        tileWidth: 16,
        tileHeight: 16,
        solid: new Array<boolean>(1600).fill(false),
        solidLayerNames: [],
    })
}
function actor(
    controllerKind: GameCharacter['controllerKind'] = 'network_player'
): GameCharacter {
    return new GameCharacter({
        id: controllerKind,
        nickname: controllerKind,
        archetype: 'human',
        controllerKind,
        faction: 'peaceful',
        spawnPosition: { x: 200, y: 200 },
    })
}
function advance(
    character: GameCharacter,
    map: NavigationService,
    now = 2_000,
    deltaMs = 1_000
): MovementNoise[] {
    const noises: MovementNoise[] = []
    advanceCharacter({
        character,
        navigation: map,
        now,
        deltaMs,
        onNoise: (noise) => noises.push(noise),
    })
    return noises
}
function agentWorld(character: GameCharacter, map: NavigationService) {
    return {
        navigationFor: () => map,
        getCharacter: () => character,
        findVisibleTarget: () => undefined,
        requestAttack: () => undefined,
    }
}

describe('authoritative movement modes', () => {
    it.each(['network_player', 'scripted'] as const)(
        'applies identical walking and sneaking without an energy cost to %s',
        (kind) => {
            for (const [mode, multiplier] of [
                ['walking', 1],
                ['sneaking', MOVEMENT_RULES.sneakSpeedMultiplier],
            ] as const) {
                const character = actor(kind)
                character.energy = 50
                handleMovementCommand(
                    character,
                    { type: 'movement_mode', mode },
                    1_000
                )
                character.setMoveInput({ x: 1, y: 0 })
                advance(character, navigation())
                expect(character.position.x).toBeCloseTo(
                    200 + character.config.moveSpeed * multiplier
                )
                expect(character.energy).toBeCloseTo(53)
                expect(character.snapshot(2_000).movement?.mode).toBe(mode)
            }
        }
    )
    it('regenerates while idle or blocked and allows walking with zero energy', () => {
        const character = actor()
        const map = navigation()
        character.energy = 50
        expect(advance(character, map)).toEqual([])
        expect(character.energy).toBe(56)
        character.position.x = 223.99
        for (let y = 0; y < 40; y += 1) {
            map.grid.solid[y * 40 + 14] = true
        }
        character.setMoveInput({ x: 1, y: 0 })
        expect(advance(character, map, 3_000)).toEqual([])
        expect(character.energy).toBe(62)
        character.energy = 0
        character.position.x = 100
        advance(character, map, 4_000)
        expect(character.movement.mode).toBe('walking')
        expect(character.position.x).toBeCloseTo(190)
        expect(character.energy).toBe(3)
    })
    it.each(['dead', 'offline', 'stunned', 'locked'] as const)(
        'blocks movement and rejects dash while %s',
        (reason) => {
            const character = actor()
            if (reason === 'dead') {
                character.alive = false
            }
            if (reason === 'offline') {
                character.tags.add('offline')
            }
            if (reason === 'stunned') {
                character.stunUntil = 5_000
            }
            if (reason === 'locked') {
                character.lockAction(1_000, 4_000)
            }
            expect(
                handleMovementCommand(character, { type: 'dash' }, 1_000)
            ).toEqual([])
            character.setMoveInput({ x: 1, y: 0 })
            expect(advance(character, navigation())).toEqual([])
            expect(character.position).toEqual({ x: 200, y: 200 })
            expect(character.movement.mode).toBe('walking')
            expect(character.energy).toBe(100)
        }
    )
})

describe('paid collision-safe dash', () => {
    it.each([
        { x: 1, y: 0 },
        { x: 1, y: 1 },
    ])(
        'normalizes direction %j and spends once with cooldown',
        (axis: Vector2) => {
            const character = actor()
            const map = navigation()
            character.setMoveInput(axis)
            handleMovementCommand(
                character,
                { type: 'movement_mode', mode: 'sneaking' },
                1_000
            )
            expect(
                handleMovementCommand(character, { type: 'dash' }, 1_000)
            ).toEqual([{ kind: 'dash', actorId: character.id }])
            expect(character.snapshot(1_000).movement).toEqual({
                mode: 'walking',
                dashing: true,
                dashCooldownMsLeft: 2_500,
            })
            expect(
                handleMovementCommand(character, { type: 'dash' }, 1_001)
            ).toEqual([])
            for (let now = 1_050; now <= 1_600; now += 50) {
                advance(character, map, now, 50)
            }
            expect(
                Math.hypot(
                    character.position.x - 200,
                    character.position.y - 200
                )
            ).toBeCloseTo(character.config.moveSpeed * 1.6 * 0.6)
            expect(character.energy).toBe(100 - MOVEMENT_RULES.dashEnergy)
            expect(character.snapshot(1_600).movement?.dashing).toBe(false)
            expect(
                handleMovementCommand(character, { type: 'dash' }, 3_499)
            ).toEqual([])
            expect(
                handleMovementCommand(character, { type: 'dash' }, 3_500)
            ).toHaveLength(1)
            expect(character.energy).toBe(100 - MOVEMENT_RULES.dashEnergy * 2)
        }
    )
    it('cannot tunnel through a one-tile wall even in a 250ms simulation step or a diagonal corner', () => {
        const character = actor()
        const map = navigation()
        for (let y = 0; y < 40; y += 1) {
            map.grid.solid[y * 40 + 14] = true
        }
        character.setMoveInput({ x: 1, y: 0 })
        handleMovementCommand(character, { type: 'dash' }, 1_000)
        advance(character, map, 1_250, 250)
        expect(character.position.x).toBeLessThan(224)
        expect(character.position.x).toBeGreaterThan(200)
        expect(map.isSolidTile(map.worldToTile(character.position))).toBe(false)
        const corner = navigation()
        corner.grid.solid[1] = true
        corner.grid.solid[40] = true
        expect(
            corner.moveWithCollision({ x: 15, y: 15 }, { x: 20, y: 20 })
        ).toEqual({ x: 15, y: 15 })
    })
    it('rejects insufficient energy and interrupts active dash on stun without refund or immunity', () => {
        const character = actor()
        character.energy = MOVEMENT_RULES.dashEnergy - 1
        expect(
            handleMovementCommand(character, { type: 'dash' }, 1_000)
        ).toEqual([])
        character.energy = MOVEMENT_RULES.dashEnergy
        handleMovementCommand(character, { type: 'dash' }, 1_000)
        character.stunUntil = 2_000
        character.applyDamage(1, 1_010)
        advance(character, navigation(), 1_050, 50)
        expect(character.position).toEqual({ x: 200, y: 200 })
        expect(character.energy).toBe(0)
        expect(character.hp).toBe(character.maxHp - 1)
        expect(character.snapshot(1_050).movement?.dashing).toBe(false)
    })
})

describe('movement command boundaries for people and agents', () => {
    it('parses valid modes and strips fabricated movement speed, stamina and cooldown', () => {
        for (const mode of ['walking', 'sneaking']) {
            expect(
                parseClientMessage(
                    JSON.stringify({
                        type: 'movement_mode',
                        mode,
                        speed: 9_999,
                    })
                ).message
            ).toEqual({ type: 'movement_mode', mode })
        }
        expect(
            parseClientMessage(
                JSON.stringify({
                    type: 'dash',
                    energy: 0,
                    cooldownMs: 0,
                    direction: { x: 999, y: 999 },
                })
            ).message
        ).toEqual({ type: 'dash' })
        expect(
            parseAgentDecision({ type: 'movement_mode', mode: 'flying' })
        ).toBeUndefined()
        for (const mode of ['running', 'flying', '', 3, null]) {
            expect(
                parseClientMessage(
                    JSON.stringify({ type: 'movement_mode', mode })
                ).error
            ).toBeDefined()
            expect(
                parseAgentDecision({ type: 'movement_mode', mode })
            ).toBeUndefined()
        }
    })
    it('lets an agent request the same modes and dash, rejects human takeover, and resets gait on wait/lease expiry', () => {
        const character = actor('scripted')
        const world = agentWorld(character, navigation())
        const service = new CompanionService()
        expect(
            service.decide(
                character,
                { type: 'movement_mode', mode: 'sneaking' },
                world,
                1_000
            ).accepted
        ).toBe(true)
        expect(character.movement.mode).toBe('sneaking')
        const dash = service.decide(character, { type: 'dash' }, world, 1_100)
        expect(dash.accepted).toBe(true)
        expect(dash.events).toEqual([{ kind: 'dash', actorId: character.id }])
        expect(character.energy).toBe(100 - MOVEMENT_RULES.dashEnergy)
        expect(
            service.decide(character, { type: 'dash' }, world, 1_200).accepted
        ).toBe(false)
        service.decide(
            character,
            { type: 'movement_mode', mode: 'sneaking' },
            world,
            1_300
        )
        service.decide(character, { type: 'wait' }, world, 1_400)
        expect(character.movement.mode).toBe('walking')
        expect(character.movement.dashAvailableAt).toBe(3_600)
        service.decide(
            character,
            { type: 'movement_mode', mode: 'sneaking' },
            world,
            2_000
        )
        expect(service.hasActiveLease(character, 7_000)).toBe(false)
        expect(character.movement.mode).toBe('walking')
        expect(
            applyAgentDecision(actor(), { type: 'dash' }, world, 8_000).accepted
        ).toBe(false)
    })
    it('reads authored surface legends independently of atlas GIDs', () => {
        expect(
            readNavigationSurfaces({
                width: 2,
                height: 2,
                layers: [
                    {
                        name: 'Footstep surfaces',
                        data: [10, 20, 30, 40],
                        properties: [
                            { name: 'surface.10', value: 'grass' },
                            { name: 'surface.20', value: 'stone' },
                            { name: 'surface.30', value: 'wood' },
                            { name: 'surface.40', value: 'dirt' },
                        ],
                    },
                ],
            })
        ).toEqual(['grass', 'stone', 'wood', 'dirt'])
    })
})
