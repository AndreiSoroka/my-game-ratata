import { MOVEMENT_RULES, type ServerMessage } from '@my-game-ratata/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { advanceCharacter } from '../src/game/movement'
import { handleMovementCommand } from '../src/game/movementActions'
import { NavigationService } from '../src/game/navigation'
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
                expect(character.energy).toBe(100)
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
            100 - MOVEMENT_RULES.dashEnergy + 0.3
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
                expect(character.energy).toBe(100 - MOVEMENT_RULES.dashEnergy)
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
