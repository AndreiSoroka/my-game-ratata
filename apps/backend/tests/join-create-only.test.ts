import type { ServerMessage } from '@my-game-ratata/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { NetworkPlayerController } from '../src/game/controllers'
import { normalizeNickname } from '../src/game/identity'
import { parseClientMessage } from '../src/game/messages'
import { readCachedConstellationLayout } from '../src/game/personalConstellationSky'
import { GameRoom } from '../src/game/room'
import { joinRoom } from '../src/game/roomIdentity'
import type { RoomSocket } from '../src/game/roomMessaging'

const takenMessage = 'Это имя уже занято. Сгенерируйте другое или введите своё'

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe('join createOnly command boundary', () => {
    it.each([true, false])(
        'preserves the explicit boolean %s',
        (createOnly) => {
            const command = { type: 'join', nickname: 'Новое Имя', createOnly }
            expect(parseClientMessage(JSON.stringify(command))).toEqual({
                message: command,
            })
        }
    )

    it('keeps a legacy join unchanged', () => {
        expect(
            parseClientMessage('{"type":"join","nickname":"  Legacy  "}')
        ).toEqual({
            message: { type: 'join', nickname: 'Legacy' },
        })
    })

    it.each([null, 0, 1, '', 'true', 'false', [], {}])(
        'rejects a nonboolean createOnly %j',
        (createOnly) => {
            expect(
                parseClientMessage(
                    JSON.stringify({
                        type: 'join',
                        nickname: 'Name',
                        createOnly,
                    })
                )
            ).toEqual({
                error: 'join.createOnly must be a boolean',
            })
        }
    )
})

describe('create-only rejection is atomic for every existing identity', () => {
    it.each(['active', 'disconnected', 'npc', 'retired'] as const)(
        'does not detach the current identity, stop control or touch a reserved %s identity',
        (kind) => {
            const f = rejectedJoinFixture(kind)
            const before = [identityState(f.current), identityState(f.reserved)]
            const maps = {
                characters: new Map(f.context.characters),
                connections: new Map(f.context.connections),
                controllers: new Map(f.context.controllers),
                nicknames: new Map(f.context.nicknames),
            }
            for (let attempt = 0; attempt < 3; attempt++) {
                joinRoom(f.context, f.request.socket, {
                    type: 'join',
                    nickname: '  каПЛя  ',
                    archetype: 'human',
                    heroClass: 'cleric',
                    createOnly: true,
                })
            }
            expect(f.request.sent).toEqual(
                Array.from({ length: 3 }, () => ({
                    type: 'error',
                    code: 'name_taken',
                    message: takenMessage,
                }))
            )
            expect(f.observer.sent).toEqual([])
            expect([
                identityState(f.current),
                identityState(f.reserved),
            ]).toEqual(before)
            expect(f.context.characters).toEqual(maps.characters)
            expect(f.context.connections).toEqual(maps.connections)
            expect(f.context.controllers).toEqual(maps.controllers)
            expect(f.context.nicknames).toEqual(maps.nicknames)
            expect(f.context.createPlayer).not.toHaveBeenCalled()
            expect(f.context.closeChestViews).not.toHaveBeenCalled()
            expect(f.context.closeConversations).not.toHaveBeenCalled()
            expect(f.context.mapFor).not.toHaveBeenCalled()
            expect(f.context.snapshotFor).not.toHaveBeenCalled()
            expect(readCachedConstellationLayout(f.reserved)).toBeUndefined()
        }
    )
})

describe('normal socket dispatch and identity creation', () => {
    it('rejects active normalized duplicates and repeated input without consuming another character ID', () => {
        const room = openRoom()
        try {
            const first = socket(room),
                second = socket(room)
            first.join('Лунный Лист', true)
            const owner = first.init()
            expect(owner.playerId).toBe('player_1')
            const receivedBefore = second.sent.length
            first.join(' лУнНыЙ лИсТ ', true)
            second.join('ЛУННЫЙ ЛИСТ', true)
            second.join(' лунный лист ', true)
            expect(first.sent.at(-1)).toEqual({
                type: 'error',
                code: 'name_taken',
                message: takenMessage,
            })
            expect(second.sent.slice(receivedBefore)).toEqual(
                Array.from({ length: 2 }, () => ({
                    type: 'error',
                    code: 'name_taken',
                    message: takenMessage,
                }))
            )
            expect(room.getCharacter(owner.playerId)?.soul.controlSource).toBe(
                'human'
            )
            second.join('Другой Лист', true)
            expect(second.init().playerId).toBe('player_2')
            first.join('Другой Лист', false)
            expect(first.sent.at(-1)).toEqual({
                type: 'error',
                code: 'name_taken',
                message:
                    'Это имя уже занято. Сгенерируйте другое или введите своё',
            })
            expect(room.getCharacter(owner.playerId)?.connected).toBe(true)
        } finally {
            room.stop()
        }
    })

    it.each([undefined, false])(
        'retains legacy reconnect when createOnly is %s',
        (manualFlag) => {
            const room = openRoom()
            try {
                const first = socket(room),
                    second = socket(room)
                first.join('Старая Искра', true)
                const owner = required(room.getCharacter(first.init().playerId))
                room.handleClose(first.socket)
                owner.tags.add('offline')
                const before = identityState(owner)
                second.join('  СТАРАЯ ИСКРА ', true)
                expect(second.sent.at(-1)).toEqual({
                    type: 'error',
                    code: 'name_taken',
                    message: takenMessage,
                })
                expect(identityState(owner)).toEqual(before)
                second.join('старая искра', manualFlag)
                expect(second.init().playerId).toBe(owner.id)
                expect(room.getCharacter(owner.id)).toBe(owner)
                expect(owner.connected).toBe(true)
                expect(owner.tags.has('offline')).toBe(false)
                expect(owner.soul.controlSource).toBe('human')
            } finally {
                room.stop()
            }
        }
    )

    it('reserves an actual NPC nickname before touching the player factory', () => {
        const room = openRoom()
        try {
            const entrant = socket(room)
            entrant.join('  miRA  ', true)
            expect(entrant.sent).toEqual([
                { type: 'error', code: 'name_taken', message: takenMessage },
            ])
            entrant.join('Чистая Искра', true)
            expect(entrant.init().playerId).toBe('player_1')
        } finally {
            room.stop()
        }
    })

    it('frees a name only after the former living identity is actually removed from the world', () => {
        const room = openRoom()
        try {
            const entrant = socket(room)
            entrant.join('Новая Жизнь', true)
            const previous = required(
                room.getCharacter(entrant.init().playerId)
            )
            previous.applyDamage(previous.hp, Date.now())
            entrant.join('новая жизнь', true)
            expect(entrant.sent.at(-1)).toEqual({
                type: 'error',
                code: 'name_taken',
                message: takenMessage,
            })
            entrant.send({ type: 'abandon_life' })
            expect(room.getCharacter(previous.id)).toBeUndefined()
            entrant.join('новая жизнь', true)
            expect(entrant.init().playerId).toBe('player_2')
        } finally {
            room.stop()
        }
    })
})

describe('canonical nickname equivalence', () => {
    it.each([
        ['active', 'Бьёрн', 'Бье\u0308рн'],
        ['echo', 'Бьёрн', 'Бье\u0308рн'],
        ['active', `${'А'.repeat(23)}ё`, `${'А'.repeat(23)}е\u0308`],
        ['echo', `${'А'.repeat(23)}ё`, `${'А'.repeat(23)}е\u0308`],
    ] as const)(
        'reserves NFC and NFD spellings for the same %s identity named %s',
        (presence, composed, decomposed) => {
            expect(normalizeNickname(`  ${composed.toUpperCase()}  `)).toBe(
                normalizeNickname(decomposed)
            )
            expect(normalizeNickname(decomposed)).toBe(
                composed.toLocaleLowerCase('en-US')
            )
            const parsed = parseClientMessage(
                JSON.stringify({
                    type: 'join',
                    nickname: decomposed,
                    createOnly: true,
                })
            )
            expect(parsed).toEqual({
                message: { type: 'join', nickname: composed, createOnly: true },
            })
            const displayName =
                parsed.message?.type === 'join'
                    ? parsed.message.nickname
                    : undefined
            expect(displayName?.length).toBeLessThanOrEqual(24)
            const room = openRoom()
            try {
                const first = socket(room),
                    second = socket(room)
                first.join(presence === 'active' ? composed : decomposed, true)
                const owner = required(room.getCharacter(first.init().playerId))
                if (presence === 'echo') {
                    room.handleClose(first.socket)
                }
                const before = identityState(owner)
                const alternative =
                    presence === 'active' ? decomposed : composed
                second.join(alternative, true)
                expect(second.sent.at(-1)).toEqual({
                    type: 'error',
                    code: 'name_taken',
                    message: takenMessage,
                })
                expect(identityState(owner)).toEqual(before)
                if (presence === 'echo') {
                    second.join(alternative)
                    expect(second.init().playerId).toBe(owner.id)
                    expect(room.getCharacter(owner.id)).toBe(owner)
                    expect(owner.soul.controlSource).toBe('human')
                    expect(owner.connected).toBe(true)
                }
            } finally {
                room.stop()
            }
        }
    )
})

function openRoom(): GameRoom {
    vi.stubGlobal('Bun', { env: {} })
    return new GameRoom()
}

function socket(room?: GameRoom) {
    const sent: ServerMessage[] = []
    const connection = {
        send: (raw: string) => sent.push(JSON.parse(raw) as ServerMessage),
    } as unknown as RoomSocket
    room?.handleOpen(connection)
    const send = (command: unknown) =>
        room?.handleMessage(connection, JSON.stringify(command))
    return {
        socket: connection,
        sent,
        send,
        join: (nickname: string, createOnly?: boolean) =>
            send({
                type: 'join',
                nickname,
                ...(createOnly === undefined ? {} : { createOnly }),
            }),
        init: () =>
            required(
                sent.filter((message) => message.type === 'world_init').at(-1)
            ),
    }
}

function rejectedJoinFixture(
    kind: 'active' | 'disconnected' | 'npc' | 'retired'
) {
    const request = socket(),
        observer = socket()
    const current = new GameCharacter({
        id: 'current',
        nickname: 'Current',
        archetype: 'human',
        controllerKind: 'network_player',
        spawnPosition: { x: 80, y: 80 },
    })
    const reserved = new GameCharacter({
        id: kind === 'npc' ? 'npc-reserved' : 'reserved',
        nickname: 'Капля',
        archetype: kind === 'npc' ? 'slime' : 'human',
        controllerKind: 'scripted',
        spawnPosition: { x: 120, y: 80 },
        soul: { controlSource: 'model' },
    })
    reserved.connected = kind === 'active'
    reserved.tags.add(kind === 'retired' ? 'state.retired' : 'offline')
    reserved.setMoveInput({ x: 1, y: 0 })
    current.setPath([{ x: 96, y: 80 }])
    const context = {
        characters: new Map([
            [current.id, current],
            [reserved.id, reserved],
        ]),
        connections: new Map([
            [request.socket, current.id],
            [observer.socket, kind === 'active' ? reserved.id : undefined],
        ]),
        controllers: new Map([
            [current.id, new NetworkPlayerController()],
            [reserved.id, new NetworkPlayerController()],
        ]),
        nicknames: new Map(kind === 'npc' ? [] : [['капля', reserved.id]]),
        createPlayer: vi.fn(() => {
            throw new Error('A rejected join must not allocate a character')
        }),
        closeChestViews: vi.fn(),
        closeConversations: vi.fn(),
        tickMs: 50,
        mapFor: vi.fn(() => {
            throw new Error('A rejected join must not prepare a map')
        }),
        snapshotFor: vi.fn(() => {
            throw new Error('A rejected join must not prepare a snapshot')
        }),
    } satisfies Parameters<typeof joinRoom>[0]
    return { request, observer, current, reserved, context }
}

function identityState(actor: GameCharacter) {
    return {
        connected: actor.connected,
        soul: structuredClone(actor.soul),
        tags: [...actor.tags],
        position: { ...actor.position },
        input: actor.getMoveInput(),
        path: actor.remainingPath(),
        movement: structuredClone(actor.movement),
        combat: structuredClone(actor.combat),
    }
}

function required<T>(value: T | undefined): T {
    if (value === undefined) {
        throw new Error('Missing join test identity')
    }
    return value
}
