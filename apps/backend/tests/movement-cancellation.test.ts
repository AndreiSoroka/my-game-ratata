import {
    type ClientMessage,
    MOVEMENT_RULES,
    ROAD_PRAYER_RULES,
    type ServerMessage,
} from '@my-game-ratata/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { availableToStartAttack } from '../src/game/combat'
import { advanceCharacter } from '../src/game/movement'
import { handleMovementCommand } from '../src/game/movementActions'
import { NavigationService } from '../src/game/navigation'
import { beginPrayerCast } from '../src/game/prayerCastStart'
import { resourceChecks } from '../src/game/resourceObservation'
import { GameRoom } from '../src/game/room'
import type { RoomSocket } from '../src/game/roomMessaging'

function navigation(): NavigationService {
    return new NavigationService({
        id: 'movement-test',
        width: 20,
        height: 20,
        tileWidth: 16,
        tileHeight: 16,
        solid: new Array<boolean>(400).fill(false),
        solidLayerNames: [],
    })
}
function actor(): GameCharacter {
    return new GameCharacter({
        id: 'hero',
        nickname: 'Hero',
        archetype: 'human',
        controllerKind: 'network_player',
        spawnPosition: { x: 100, y: 100 },
    })
}

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

describe('movement intent cancellation', () => {
    it.each(['walking', 'sneaking'] as const)(
        'honors a gait change to %s during attack/stun without granting a dash',
        (mode) => {
            for (const lock of ['attack', 'stun']) {
                const character = actor()
                handleMovementCommand(
                    character,
                    {
                        type: 'movement_mode',
                        mode: mode === 'walking' ? 'sneaking' : 'walking',
                    },
                    1_000
                )
                if (lock === 'attack') {
                    character.lockAction(1_050, 450)
                } else {
                    character.stunUntil = 1_500
                }
                handleMovementCommand(
                    character,
                    { type: 'movement_mode', mode },
                    1_100
                )
                expect(character.movement.mode).toBe(mode)
                expect(
                    handleMovementCommand(character, { type: 'dash' }, 1_100)
                ).toEqual([])
                expect(character.energy).toBe(
                    character.config.resources.maxEnergy
                )
            }
        }
    )
    it('cancels a dash with a gait intent without refunding energy or resetting cooldown', () => {
        const character = actor()
        handleMovementCommand(character, { type: 'dash' }, 1_000)
        handleMovementCommand(
            character,
            { type: 'movement_mode', mode: 'walking' },
            1_050
        )
        advanceCharacter({
            character,
            navigation: navigation(),
            now: 1_100,
            deltaMs: 50,
        })
        expect(character.position).toEqual({ x: 100, y: 100 })
        expect(character.movement.dashUntil).toBe(0)
        expect(character.movement.dashAvailableAt).toBe(3_500)
        expect(character.energy).toBeCloseTo(
            character.config.resources.maxEnergy -
                MOVEMENT_RULES.dashEnergy +
                0.3
        )
        expect(
            handleMovementCommand(character, { type: 'dash' }, 1_100)
        ).toEqual([])
    })
    it.each(['dead', 'offline', 'stun'] as const)(
        'clears a latched gait or dash when %s is advanced',
        (reason) => {
            for (const intent of ['sneaking', 'dash']) {
                const character = actor()
                handleMovementCommand(
                    character,
                    intent === 'dash'
                        ? { type: 'dash' }
                        : { type: 'movement_mode', mode: 'sneaking' },
                    1_000
                )
                if (reason === 'dead') {
                    character.applyDamage(character.hp, 1_010)
                }
                if (reason === 'offline') {
                    character.tags.add('offline')
                }
                if (reason === 'stun') {
                    character.stunUntil = 2_000
                }
                advanceCharacter({
                    character,
                    navigation: navigation(),
                    now: 1_050,
                    deltaMs: 50,
                })
                expect(character.movement.mode).toBe('walking')
                expect(character.movement.dashUntil).toBe(0)
                expect(character.movement.dashAvailableAt).toBe(
                    intent === 'dash' ? 3_500 : 0
                )
                expect(character.position).toEqual({ x: 100, y: 100 })
            }
        }
    )
})

describe('standing dash at ordinary location borders', () => {
    it.each([
        {
            direction: 'right',
            position: { x: 308, y: 200 },
            destination: 'map-3-2',
        },
        {
            direction: 'left',
            position: { x: 12, y: 200 },
            destination: 'map-1-2',
        },
        {
            direction: 'up',
            position: { x: 200, y: 12 },
            destination: 'map-2-1',
        },
        {
            direction: 'down',
            position: { x: 200, y: 308 },
            destination: 'map-2-3',
        },
    ] as const)(
        'crosses $direction without held WASD or a path and preserves cooldown',
        ({ direction, position, destination }) => {
            vi.stubGlobal('Bun', { env: {} })
            vi.useFakeTimers()
            vi.setSystemTime(1_000)
            const room = new GameRoom(navigation())
            const sent: ServerMessage[] = []
            const socket = {
                send: (payload: string) =>
                    sent.push(JSON.parse(payload) as ServerMessage),
            } as unknown as RoomSocket
            room.handleOpen(socket)
            room.handleMessage(
                socket,
                JSON.stringify({ type: 'join', nickname: 'Edge Dasher' })
            )
            const init = sent.find((message) => message.type === 'world_init')
            const character = room.getCharacter(init?.playerId ?? '')
            if (character === undefined) {
                throw new Error('Missing player')
            }
            character.position = { ...position }
            character.facing = direction
            room.handleMessage(socket, JSON.stringify({ type: 'dash' }))
            room.start()
            try {
                vi.advanceTimersByTime(50)
                expect(character.locationId).toBe(destination)
                expect(character.movement.dashAvailableAt).toBe(3_500)
                expect(character.energy).toBe(
                    character.config.resources.maxEnergy -
                        MOVEMENT_RULES.dashEnergy
                )
                expect(
                    room
                        .navigationFor(character)
                        .isSolidTile(
                            room
                                .navigationFor(character)
                                .worldToTile(character.position)
                        )
                ).toBe(false)
            } finally {
                room.stop()
            }
        }
    )
})

it('keeps held walking input during Road Prayer and interrupts on crossing a border', () => {
    vi.stubGlobal('Bun', { env: {} })
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const room = new GameRoom(navigation())
    const sent: ServerMessage[] = []
    const socket = {
        send: (payload: string) =>
            sent.push(JSON.parse(payload) as ServerMessage),
    } as unknown as RoomSocket
    room.handleOpen(socket)
    const send = (message: ClientMessage) =>
        room.handleMessage(socket, JSON.stringify(message))
    send({ type: 'join', nickname: 'Road Cleric' })
    const init = sent.find((message) => message.type === 'world_init')
    const character = room.getCharacter(init?.playerId ?? '')
    if (character === undefined) {
        throw new Error('Missing player')
    }
    character.position = { x: 305, y: 200 }
    character.energy = 50
    character.abilities.known.add('pray_road')
    character.progression.constellations.opened.add('prayer_road.walk')
    send({ type: 'move_input', axis: { x: 1, y: 0 } })
    send({
        type: 'use_ability',
        abilityId: 'pray_road',
        intent: { mode: 'restore', targetId: character.id },
    })
    room.start()
    try {
        vi.advanceTimersByTime(50)
        expect(character.abilities.casting?.abilityId).toBe('pray_road')
        expect(character.position.x).toBeGreaterThan(305)
        expect(character.locationId).toBe('map-2-2')
        vi.advanceTimersByTime(50)
        expect(character.locationId).toBe('map-3-2')
        expect(character.abilities.casting).toBeNull()
    } finally {
        room.stop()
    }
})

it('honors a Road Prayer dash discount once, only before expiry and on a payable dash', () => {
    const character = actor()
    const expiresAt = 1_000 + ROAD_PRAYER_RULES.dashDiscountDurationMs
    const discountedCost =
        MOVEMENT_RULES.dashEnergy - ROAD_PRAYER_RULES.dashDiscount
    character.movement.roadPrayerDashUntil = expiresAt
    character.energy = discountedCost - 1
    const dash = { type: 'dash' } as const

    expect(handleMovementCommand(character, dash, 1_000)).toEqual([])
    expect(character.movement.roadPrayerDashUntil).toBe(expiresAt)

    character.energy = discountedCost
    expect(resourceChecks(character, expiresAt - 1).dash).toBe('ready')
    expect(resourceChecks(character, expiresAt).dash).toBe('energy')
    expect(handleMovementCommand(character, dash, expiresAt - 1)).toEqual([
        { kind: 'dash', actorId: character.id },
    ])
    expect(character.energy).toBe(0)
    expect(character.movement.roadPrayerDashUntil).toBeUndefined()

    character.energy = discountedCost
    expect(
        handleMovementCommand(
            character,
            dash,
            character.movement.dashAvailableAt
        )
    ).toEqual([])
})

it('keeps attacks blocked and interrupts a walking prayer only when a dash is valid', () => {
    const character = actor()
    character.energy = 5
    character.abilities.known.add('pray_road')
    character.progression.constellations.opened.add('prayer_road.walk')
    expect(
        beginPrayerCast(
            character,
            { mode: 'restore', targetId: character.id },
            { characters: [character], now: 1_000, navigation: navigation() },
            'pray_road'
        )
    ).toMatchObject([{ kind: 'cast', phase: 'started' }])
    expect(availableToStartAttack(character, 1_050)).toBe(false)

    const dash = { type: 'dash' } as const
    expect(handleMovementCommand(character, dash, 1_050)).toEqual([])
    expect(character.abilities.casting?.abilityId).toBe('pray_road')

    character.energy = MOVEMENT_RULES.dashEnergy
    expect(handleMovementCommand(character, dash, 1_100)).toMatchObject([
        { kind: 'cast', phase: 'interrupted' },
        { kind: 'dash' },
    ])
    expect(character.abilities.casting).toBeNull()
    expect(character.energy).toBe(0)
})
