import type {
    CharacterArchetype,
    CharacterControllerKind,
    CharacterFactionId,
    CharacterReputation,
    ServerMessage,
    WorldInitServerMessage,
} from '@my-game-ratata/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { attemptAttack, resolvePendingAttackHit } from '../src/game/combat'
import { advanceCharacter } from '../src/game/movement'
import type { NavigationService } from '../src/game/navigation'
import { GameRoom } from '../src/game/room'
import type { RoomSocket } from '../src/game/roomMessaging'

interface FakeSocket {
    sent: ServerMessage[]
    send: (payload: string) => void
}

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe('game room joins', () => {
    it('rejects an active duplicate nickname until the first socket leaves', () => {
        vi.stubGlobal('Bun', { env: {} })
        const room = new GameRoom()
        const first = createSocket()
        const second = createSocket()

        room.handleOpen(asRoomSocket(first))
        room.handleMessage(
            asRoomSocket(first),
            JSON.stringify({ nickname: 'Andrei', type: 'join' })
        )
        const firstInit = findWorldInit(first)

        room.handleOpen(asRoomSocket(second))
        room.handleMessage(
            asRoomSocket(second),
            JSON.stringify({ nickname: 'andrei', type: 'join' })
        )

        expect(second.sent).toContainEqual({
            code: 'name_taken',
            message: 'Nickname is already in use',
            type: 'error',
        })
        expect(findWorldInit(second)).toBeUndefined()

        room.handleClose(asRoomSocket(first))
        room.handleMessage(
            asRoomSocket(second),
            JSON.stringify({ nickname: 'andrei', type: 'join' })
        )

        expect(findWorldInit(second)?.playerId).toBe(firstInit?.playerId)
    })

    it('starts with skeleton and slime monsters and peaceful players', () => {
        vi.stubGlobal('Bun', { env: {} })
        const room = new GameRoom()
        const socket = createSocket()

        room.handleOpen(asRoomSocket(socket))
        room.handleMessage(
            asRoomSocket(socket),
            JSON.stringify({ nickname: 'Andrei', type: 'join' })
        )

        const init = findWorldInit(socket)
        expect(init).toBeDefined()
        if (init === undefined) {
            throw new Error('world_init was not sent')
        }

        const characters = new Map(
            init.snapshot.characters.map((character) => [
                character.id,
                character,
            ])
        )
        const player = characters.get(init.playerId)
        const skeleton = characters.get('mob_skeleton_1')
        const slime = characters.get('mob_slime_1')

        expect(player?.faction).toBe('peaceful')
        expect(player?.reputation.monsters).toBe(-100)
        expect(skeleton?.archetype).toBe('skeleton')
        expect(skeleton?.faction).toBe('monsters')
        expect(skeleton?.hp).toBe(20)
        expect(skeleton?.maxHp).toBe(20)
        expect(skeleton?.resources.maxEnergy).toBe(225)
        expect(slime?.archetype).toBe('slime')
        expect(slime?.faction).toBe('monsters')
        expect(slime?.resources.maxEnergy).toBe(60)

        expect(skeleton).toBeDefined()
        expect(slime).toBeDefined()
        if (skeleton === undefined || slime === undefined) {
            throw new Error('monster spawn missing from world_init')
        }

        expect(
            room.navigation.isSolidTile(
                room.navigation.worldToTile(skeleton.position)
            )
        ).toBe(false)
        expect(
            room.navigation.isSolidTile(
                room.navigation.worldToTile(slime.position)
            )
        ).toBe(false)
    })
})

describe('shared combat windup', () => {
    it('spends resources and starts attack immediately, then damages after windup', () => {
        const now = 1_000
        const attacker = createCharacter('attacker', 'Hero', 'human', {
            x: 32,
            y: 32,
        })
        const target = createCharacter('target', 'Target', 'skeleton', {
            x: 32,
            y: 40,
        })

        const startEvents = startAttack(attacker, [attacker, target], now)

        expect(startEvents).toEqual([{ actorId: 'attacker', kind: 'attack' }])
        expect(attacker.energy).toBe(85)
        expect(attacker.animationAction).toBe('attack')
        expect(attacker.attackZones).toHaveLength(1)
        expect(target.hp).toBe(target.maxHp)

        expect(
            resolvePendingAttackHit(
                attackContext(attacker, [attacker, target], now + 49)
            )
        ).toEqual([])
        expect(target.hp).toBe(target.maxHp)

        const hitEvents = resolvePendingAttackHit(
            attackContext(attacker, [attacker, target], now + 50)
        )

        expect(hitEvents).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    actorId: 'attacker',
                    kind: 'damage',
                    targetId: 'target',
                }),
            ])
        )
        expect(target.hp).toBeLessThan(target.maxHp)
        expect(
            resolvePendingAttackHit(attackContext(attacker, [target], now + 51))
        ).toEqual([])
    })
})

describe('shared combat resources', () => {
    it('lets full-energy direct hits stun and drain target energy', () => {
        const now = 1_500
        const attacker = createCharacter('attacker', 'Hero', 'human', {
            x: 32,
            y: 32,
        })
        const target = createCharacter('target', 'Target', 'skeleton', {
            x: 32,
            y: 40,
        })
        vi.spyOn(Math, 'random')
            .mockReturnValueOnce(0)
            .mockReturnValueOnce(0.99)
            .mockReturnValueOnce(0)
            .mockReturnValueOnce(0)

        startAttack(attacker, [attacker, target], now)
        const hitEvents = resolvePendingAttackHit(
            attackContext(attacker, [attacker, target], now + 50)
        )

        expect(hitEvents).toEqual([
            {
                actorId: 'attacker',
                amount: 5,
                kind: 'damage',
                targetId: 'target',
            },
        ])
        expect(target.energy).toBe(217)
        expect(target.stunUntil).toBe(now + 50 + 300)
    })

    it('keeps sufficient but non-full energy attacks normal, without stun', () => {
        const now = 1_700
        const attacker = createCharacter('attacker', 'Hero', 'human', {
            x: 32,
            y: 32,
        })
        const target = createCharacter('target', 'Target', 'skeleton', {
            x: 32,
            y: 40,
        })
        attacker.energy = 50
        vi.spyOn(Math, 'random')
            .mockReturnValueOnce(0)
            .mockReturnValueOnce(0.99)
            .mockReturnValueOnce(0)

        startAttack(attacker, [attacker, target], now)
        const hitEvents = resolvePendingAttackHit(
            attackContext(attacker, [attacker, target], now + 50)
        )

        expect(hitEvents).toEqual([
            {
                actorId: 'attacker',
                amount: 5,
                kind: 'damage',
                targetId: 'target',
            },
        ])
        expect(attacker.energy).toBe(35)
        expect(target.stunUntil).toBe(0)
    })

    it('makes energy-starved attacks slower, weaker, and unable to stun', () => {
        const now = 1_800
        const attacker = createCharacter('attacker', 'Hero', 'human', {
            x: 32,
            y: 32,
        })
        const target = createCharacter('target', 'Target', 'skeleton', {
            x: 32,
            y: 40,
        })
        attacker.energy = 5
        vi.spyOn(Math, 'random')
            .mockReturnValueOnce(0)
            .mockReturnValueOnce(0.99)
            .mockReturnValueOnce(0)

        expect(startAttack(attacker, [attacker, target], now)).toHaveLength(1)
        expect(attacker.energy).toBe(0)
        expect(attacker.actionLockUntil).toBe(
            now + attacker.config.combat.attackLockMs * 2
        )

        expect(
            resolvePendingAttackHit(
                attackContext(attacker, [attacker, target], now + 99)
            )
        ).toEqual([])
        expect(target.hp).toBe(target.maxHp)

        const hitEvents = resolvePendingAttackHit(
            attackContext(attacker, [attacker, target], now + 100)
        )

        expect(hitEvents).toEqual([
            {
                actorId: 'attacker',
                amount: 2,
                kind: 'damage',
                targetId: 'target',
            },
        ])
        expect(target.stunUntil).toBe(0)
    })
})

describe('shared combat hit validation', () => {
    it('does not damage if the target leaves the attack zone before windup', () => {
        const now = 2_000
        const attacker = createCharacter('attacker', 'Hero', 'human', {
            x: 32,
            y: 32,
        })
        const target = createCharacter('target', 'Target', 'skeleton', {
            x: 32,
            y: 40,
        })

        startAttack(attacker, [attacker, target], now)
        target.position = { x: 120, y: 120 }

        expect(
            resolvePendingAttackHit(
                attackContext(attacker, [attacker, target], now + 50)
            )
        ).toEqual([])
        expect(target.hp).toBe(target.maxHp)
    })

    it('does not hit same-faction monsters', () => {
        const now = 2_300
        const skeleton = createCharacter('skeleton', 'Skeleton', 'skeleton', {
            x: 32,
            y: 32,
        })
        const slime = createCharacter('slime', 'Slime', 'slime', {
            x: 32,
            y: 40,
        })

        startAttack(skeleton, [skeleton, slime], now)

        expect(
            resolvePendingAttackHit(
                attackContext(skeleton, [skeleton, slime], now + 220)
            )
        ).toEqual([])
        expect(slime.hp).toBe(slime.maxHp)
    })

    it('does not hit targets with positive reputation to the attacker faction', () => {
        const now = 2_500
        const skeleton = createCharacter('skeleton', 'Skeleton', 'skeleton', {
            x: 32,
            y: 32,
        })
        const friendly = createCharacter(
            'friendly',
            'Friendly',
            'human',
            { x: 32, y: 40 },
            { reputation: { monsters: 10 } }
        )

        startAttack(skeleton, [skeleton, friendly], now)

        expect(
            resolvePendingAttackHit(
                attackContext(skeleton, [skeleton, friendly], now + 220)
            )
        ).toEqual([])
        expect(friendly.hp).toBe(friendly.maxHp)
    })
})

describe('shared combat locks', () => {
    it('blocks movement during attack lock and allows it afterwards for players and NPCs', () => {
        const now = 3_000
        const player = createCharacter('player', 'Player', 'human', {
            x: 32,
            y: 32,
        })
        const npc = createCharacter('npc', 'Skeleton', 'skeleton', {
            x: 64,
            y: 64,
        })
        const target = createCharacter('target', 'Target', 'skeleton', {
            x: 32,
            y: 40,
        })

        startAttack(player, [player, target], now)
        startAttack(npc, [npc, target], now)
        player.setMoveInput({ x: 1, y: 0 })
        npc.setMoveInput({ x: 1, y: 0 })

        advanceCharacter({
            character: player,
            deltaMs: 50,
            navigation: fakeNavigation,
            now: now + 50,
        })
        advanceCharacter({
            character: npc,
            deltaMs: 50,
            navigation: fakeNavigation,
            now: now + 50,
        })

        expect(player.position).toEqual({ x: 32, y: 32 })
        expect(npc.position).toEqual({ x: 64, y: 64 })

        advanceCharacter({
            character: player,
            deltaMs: 50,
            navigation: fakeNavigation,
            now: now + player.config.combat.attackLockMs + 1,
        })
        advanceCharacter({
            character: npc,
            deltaMs: 50,
            navigation: fakeNavigation,
            now: now + npc.config.combat.attackLockMs + 1,
        })

        expect(player.position.x).toBeGreaterThan(32)
        expect(npc.position.x).toBeGreaterThan(64)
    })

    it('rejects attacks during cooldown and lets NPCs make exhausted attacks', () => {
        const now = 4_000
        const attacker = createCharacter('attacker', 'Hero', 'human', {
            x: 32,
            y: 32,
        })
        const target = createCharacter('target', 'Target', 'skeleton', {
            x: 32,
            y: 40,
        })
        const npc = createCharacter('npc', 'Skeleton', 'skeleton', {
            x: 64,
            y: 64,
        })

        expect(startAttack(attacker, [attacker, target], now)).toHaveLength(1)
        expect(
            startAttack(attacker, [attacker, target], now + 100)
        ).toHaveLength(0)

        npc.energy = 0
        expect(startAttack(npc, [npc, target], now)).toHaveLength(1)
        expect(npc.energy).toBe(0)
        expect(npc.actionLockUntil).toBe(
            now + npc.config.combat.attackLockMs * 2
        )
    })
})

function createSocket(): FakeSocket {
    return {
        sent: [],
        send(payload) {
            this.sent.push(JSON.parse(payload) as ServerMessage)
        },
    }
}

function asRoomSocket(socket: FakeSocket): RoomSocket {
    return socket as unknown as RoomSocket
}

function findWorldInit(socket: FakeSocket): WorldInitServerMessage | undefined {
    return socket.sent.find((message) => message.type === 'world_init')
}

function createCharacter(
    id: string,
    nickname: string,
    archetype: CharacterArchetype,
    spawnPosition: { x: number; y: number },
    options: {
        controllerKind?: CharacterControllerKind
        faction?: CharacterFactionId
        reputation?: CharacterReputation
    } = {}
): GameCharacter {
    return new GameCharacter({
        archetype,
        controllerKind:
            options.controllerKind ??
            (archetype === 'human' ? 'network_player' : 'mob1'),
        id,
        nickname,
        ...(options.faction === undefined ? {} : { faction: options.faction }),
        ...(options.reputation === undefined
            ? {}
            : { reputation: options.reputation }),
        spawnPosition,
    })
}

function startAttack(
    attacker: GameCharacter,
    targets: GameCharacter[],
    now: number
) {
    return attemptAttack(attackContext(attacker, targets, now))
}

function attackContext(
    actor: GameCharacter,
    targets: GameCharacter[],
    now: number
) {
    return {
        actor,
        now,
        respawnDelayMsFor: () => 1_000,
        targets,
        tileSize: 16,
    }
}

const fakeNavigation = {
    moveWithCollision(
        position: { x: number; y: number },
        delta: { x: number; y: number }
    ) {
        return {
            x: position.x + delta.x,
            y: position.y + delta.y,
        }
    },
} as NavigationService
