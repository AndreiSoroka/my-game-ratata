import type {
    HeroClass,
    ServerMessage,
    Vector2,
    WorldInitServerMessage,
    WorldSnapshot,
} from '@my-game-ratata/contracts'
import {
    CENTER_LOCATION_ID,
    GRID_SIZE,
    WORLD_LOCATION_DEFINITIONS,
} from '@my-game-ratata/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { createItemInstance } from '../src/game/inventory'
import {
    loadNavigationService,
    NavigationService,
} from '../src/game/navigation'
import { GameRoom } from '../src/game/room'
import type { RoomSocket } from '../src/game/roomMessaging'
import { WorldLocations } from '../src/game/worldLocations'

interface FakeSocket {
    sent: ServerMessage[]
    send(payload: string): void
}

const rooms: GameRoom[] = []
let generatedWorld: WorldLocations | undefined
const directions = [
    { name: 'left', vector: { x: -1, y: 0 } },
    { name: 'right', vector: { x: 1, y: 0 } },
    { name: 'up', vector: { x: 0, y: -1 } },
    { name: 'down', vector: { x: 0, y: 1 } },
]
const crossings = WORLD_LOCATION_DEFINITIONS.flatMap((location) =>
    directions.map((direction) => ({ ...location, ...direction }))
)

beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    vi.stubGlobal('Bun', { env: {} })
})

afterEach(() => {
    for (const room of rooms.splice(0)) {
        room.stop()
    }
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

describe('generated Novogorod region', () => {
    it('loads twenty-five distinct maps with walkable center and edge gates', () => {
        const world = actualWorld()
        expect(world.locations.size).toBe(GRID_SIZE * GRID_SIZE)
        expect(
            new Set(
                [...world.locations.values()].map(
                    (location) => location.description.name
                )
            ).size
        ).toBe(GRID_SIZE * GRID_SIZE)
        for (const location of world.locations.values()) {
            expect(location.description).toMatchObject({
                columns: GRID_SIZE,
                rows: GRID_SIZE,
            })
            expect(location.navigation.grid.width).toBeGreaterThanOrEqual(64)
            expect(location.navigation.grid.height).toBeGreaterThanOrEqual(64)
            for (const { vector } of directions) {
                const point = edgePoint(location.navigation, vector)
                expect(
                    location.navigation.isSolidTile(
                        location.navigation.worldToTile(point)
                    )
                ).toBe(false)
            }
        }
    })

    it.each(crossings)(
        'crosses ($column,$row) $name or warns once at the boundary',
        ({ column, row, vector }) => {
            const world = actualWorld()
            const locationId = `map-${String(column)}-${String(row)}`
            const navigation = world.get(locationId).navigation
            const actor = hero(
                `${locationId}:${String(vector.x)}:${String(vector.y)}`,
                locationId
            )
            actor.position = edgePoint(navigation, vector)
            actor.hp = actor.maxHp - 3
            actor.xp = 55
            actor.inventory.push(createItemInstance('food'))
            const before = {
                position: { ...actor.position },
                hp: actor.hp,
                xp: actor.xp,
                id: actor.id,
                items: [...actor.inventory],
            }
            const nextColumn = column + vector.x
            const nextRow = row + vector.y
            const hasNeighbor =
                nextColumn >= 0 &&
                nextColumn < GRID_SIZE &&
                nextRow >= 0 &&
                nextRow < GRID_SIZE
            const notice = world.travel(actor, vector)

            expect(actor.id).toBe(before.id)
            expect(actor.hp).toBe(before.hp)
            expect(actor.xp).toBe(before.xp)
            expect(actor.inventory).toEqual(before.items)

            if (!hasNeighbor) {
                expect(notice).toBe('А там дальше живут драконы')
                expect(actor.locationId).toBe(locationId)
                expect(actor.position).toEqual(before.position)
                expect(world.travel(actor, vector)).toBeUndefined()
                const edge = { ...actor.position }
                actor.position = {
                    x: navigation.summary.worldWidth / 2,
                    y: navigation.summary.worldHeight / 2,
                }
                world.travel(actor, { x: -vector.x, y: -vector.y })
                actor.position = edge
                expect(world.travel(actor, vector)).toBe(
                    'А там дальше живут драконы'
                )
                return
            }

            expect(actor.locationId).toBe(
                `map-${String(nextColumn)}-${String(nextRow)}`
            )
            const destination = world.get(actor.locationId)
            expect(notice).toBe(`Локация: ${destination.description.name}`)
            expect(
                destination.navigation.isSolidTile(
                    destination.navigation.worldToTile(actor.position)
                )
            ).toBe(false)
            expect(vector.x === 0 ? actor.position.x : actor.position.y).toBe(
                vector.x === 0 ? before.position.x : before.position.y
            )
            expect(actor.position).not.toEqual(before.position)
        }
    )
})

it('releases a stationary Quick Shot before held movement can cross the map edge', () => {
    const room = openRoom()
    const client = socket()
    const init = join(room, client, 'Archer at the edge', 'ranger')
    const player = findPlayer(room, init)
    const axis = { x: 1, y: 0 }
    const edge = edgePoint(room.navigation, axis)
    player.position = edge
    player.facing = 'left'
    room.handleMessage(
        asSocket(client),
        JSON.stringify({ type: 'move_input', axis })
    )
    room.handleMessage(
        asSocket(client),
        JSON.stringify({ type: 'use_ability', abilityId: 'shot' })
    )
    const actionId = player.pendingAttack?.actionId
    expect(actionId).toBeDefined()

    room.start()
    vi.advanceTimersByTime(200)
    expect(player.locationId).toBe(CENTER_LOCATION_ID)
    expect(player.position).toEqual(edge)
    const release = client.sent.find(
        (message) =>
            message.type === 'event' &&
            message.event.actionId === actionId &&
            message.event.phase === 'completed'
    )
    expect(release).toMatchObject({
        event: { abilityId: 'shot', projectile: { origin: edge } },
    })
    vi.advanceTimersByTime(50)
    expect(player.locationId).toBe('map-3-2')
})

describe('game room location and life integration', () => {
    it('travels through socket input and isolates snapshots and resources', () => {
        const room = openRoom()
        const first = socket()
        const second = socket()
        const init = join(room, first, 'traveler')
        join(room, second, 'observer')
        const player = findPlayer(room, init)
        player.position = edgePoint(room.navigation, { x: 1, y: 0 })
        room.handleMessage(
            asSocket(first),
            JSON.stringify({ axis: { x: 1, y: 0 }, type: 'move_input' })
        )
        room.start()
        vi.advanceTimersByTime(50)
        const traveling = latestSnapshot(first)
        const staying = latestSnapshot(second)

        expect(traveling.location?.id).toBe('map-3-2')
        expect(
            traveling.characters.some(
                (character) => character.id === init.playerId
            )
        ).toBe(true)
        expect(staying.location?.id).toBe(CENTER_LOCATION_ID)
        expect(
            staying.characters.some(
                (character) => character.id === init.playerId
            )
        ).toBe(false)
        const observerMessageCount = second.sent.length
        room.handleMessage(
            asSocket(first),
            JSON.stringify({ text: 'cross-room-probe', type: 'chat' })
        )
        expect(second.sent).toHaveLength(observerMessageCount)
        expect(
            first.sent.some(
                (message) =>
                    message.type === 'event' &&
                    message.event.kind === 'chat' &&
                    message.event.text === 'cross-room-probe'
            )
        ).toBe(true)
        expect(traveling.adventure?.resourceNodes.length).toBeGreaterThan(0)
        expect(
            traveling.adventure?.resourceNodes.every(
                (node) => node.locationId === 'map-3-2'
            )
        ).toBe(true)
    })

    it('selects visible targets and resolves hits only inside the actor location', () => {
        const room = openRoom()
        const observer = hero('observer', 'map-3-2')
        observer.position = { x: 168, y: 88 }
        const near = room.findVisibleTarget(observer, 100)
        observer.locationId = 'map-0-0'
        const far = room.findVisibleTarget(observer, 100)
        expect(near).toBeDefined()
        expect(far).toBeDefined()
        if (near === undefined || far === undefined) {
            throw new Error('Missing monsters')
        }
        expect(near.locationId).toBe('map-3-2')
        expect(far.locationId).toBe('map-0-0')
        const enemyObserver = new GameCharacter({
            archetype: 'skeleton',
            controllerKind: 'mob1',
            faction: 'monsters',
            id: 'enemy-observer',
            nickname: 'Enemy',
            spawnPosition: { x: 72, y: 40 },
        })
        const actor = room.findVisibleTarget(enemyObserver, 0)
        if (actor === undefined) {
            throw new Error('Missing friendly actor')
        }
        actor.locationId = near.locationId
        actor.position = { x: 80, y: 72 }
        actor.facing = 'down'
        near.position = { x: 80, y: 80 }
        far.position = { x: 80, y: 80 }
        const farHp = far.hp
        room.requestAttack(actor)
        room.start()
        vi.advanceTimersByTime(50)

        expect(near.hp).toBeLessThan(near.maxHp)
        expect(far.hp).toBe(farHp)
        expect(
            room
                .snapshot(Date.now(), actor.locationId)
                .characters.some((character) => character.id === far.id)
        ).toBe(false)
    })
})

describe('room identity lifecycle', () => {
    it('keeps a disconnected hero visible and vulnerable as an Echo, then restores its human Spark', () => {
        const room = openRoom()
        const first = socket()
        const init = join(room, first, 'returning-hero')
        const player = findPlayer(room, init)
        player.xp = 30
        player.inventory.push(createItemInstance('food'))
        const observer = new GameCharacter({
            archetype: 'slime',
            controllerKind: 'mob1',
            faction: 'monsters',
            id: 'observer',
            nickname: 'Observer',
            spawnPosition: { ...player.position },
        })
        expect(room.findVisibleTarget(observer, 0)?.id).toBe(init.playerId)
        room.handleClose(asSocket(first))
        expect(
            room
                .snapshot()
                .characters.some((character) => character.id === init.playerId)
        ).toBe(true)
        expect(player.connected).toBe(false)
        expect(player.tags.has('offline')).toBe(false)
        expect(player.soul).toMatchObject({
            kind: 'echo',
            controlSource: 'script',
        })
        expect(room.findVisibleTarget(observer, 0)?.id).toBe(init.playerId)
        const rejoined = join(room, socket(), 'returning-hero')
        expect(rejoined.playerId).toBe(init.playerId)
        expect(player.connected).toBe(true)
        expect(player.soul).toMatchObject({
            kind: 'spark',
            controlSource: 'human',
        })
        const restored = rejoined.snapshot.characters.find(
            (character) => character.id === init.playerId
        )
        expect(restored?.xp).toBe(30)
        expect(restored?.inventory.map((item) => item.itemId)).toEqual(['food'])
    })

    it('retires a dead identity after the revival window and permits the same nickname as a new hero', () => {
        const room = openRoom()
        const first = socket()
        const init = join(room, first, 'Phoenix')
        const player = findPlayer(room, init)
        player.inventory.push(createItemInstance('simple_sword'))
        player.xp = 90
        player.position = { x: 24, y: 24 }
        player.applyDamage(player.hp, Date.now())
        room.start()
        vi.setSystemTime(player.reviveUntil + 1)
        vi.advanceTimersByTime(50)

        expect(
            room
                .snapshot()
                .characters.some((character) => character.id === init.playerId)
        ).toBe(false)
        expect(
            first.sent.filter(
                (message) =>
                    message.type === 'event' &&
                    message.event.kind === 'permadeath' &&
                    message.event.actorId === init.playerId
            )
        ).toHaveLength(1)
        const replacement = join(room, socket(), 'phoenix')
        expect(replacement.playerId).not.toBe(init.playerId)
        const next = replacement.snapshot.characters.find(
            (character) => character.id === replacement.playerId
        )
        expect(next).toMatchObject({
            alive: true,
            inventory: [],
            level: 1,
            xp: 0,
        })
        expect(replacement.snapshot.adventure).toMatchObject({
            gold: 0,
            quest: { status: 'available' },
            trophies: 0,
        })
    })
})

function actualWorld(): WorldLocations {
    generatedWorld ??= new WorldLocations(loadNavigationService())
    return generatedWorld
}

function openRoom(): GameRoom {
    const room = new GameRoom(
        new NavigationService({
            height: 20,
            id: 'open-test',
            solid: Array<boolean>(400).fill(false),
            solidLayerNames: [],
            tileHeight: 16,
            tileWidth: 16,
            width: 20,
        })
    )
    rooms.push(room)
    return room
}

function hero(
    id: string,
    locationId: string = CENTER_LOCATION_ID
): GameCharacter {
    return new GameCharacter({
        archetype: 'human',
        controllerKind: 'network_player',
        faction: 'peaceful',
        id,
        locationId,
        nickname: id,
        spawnPosition: { x: 24, y: 24 },
    })
}

function edgePoint(navigation: NavigationService, direction: Vector2): Vector2 {
    const { tileWidth, tileHeight, worldWidth, worldHeight, width, height } =
        navigation.summary
    const center = navigation.tileToWorld({
        x: Math.floor(width / 2),
        y: Math.floor(height / 2),
    })
    return {
        x:
            direction.x < 0
                ? tileWidth / 2
                : direction.x > 0
                  ? worldWidth - tileWidth / 2
                  : center.x,
        y:
            direction.y < 0
                ? tileHeight / 2
                : direction.y > 0
                  ? worldHeight - tileHeight / 2
                  : center.y,
    }
}

function socket(): FakeSocket {
    return {
        sent: [],
        send(payload) {
            this.sent.push(JSON.parse(payload) as ServerMessage)
        },
    }
}

function asSocket(value: FakeSocket): RoomSocket {
    return value as unknown as RoomSocket
}

function join(
    room: GameRoom,
    value: FakeSocket,
    nickname: string,
    heroClass?: HeroClass
): WorldInitServerMessage {
    room.handleOpen(asSocket(value))
    room.handleMessage(
        asSocket(value),
        JSON.stringify({ nickname, type: 'join', heroClass })
    )
    const init = value.sent.find((message) => message.type === 'world_init')
    if (init === undefined) {
        throw new Error('Missing world_init')
    }
    return init
}

function findPlayer(
    room: GameRoom,
    init: WorldInitServerMessage
): GameCharacter {
    const snapshot = init.snapshot.characters.find(
        (character) => character.id === init.playerId
    )
    if (snapshot === undefined) {
        throw new Error('Missing player snapshot')
    }
    const observer = new GameCharacter({
        archetype: 'slime',
        controllerKind: 'mob1',
        faction: 'monsters',
        id: 'find-player',
        nickname: 'Observer',
        spawnPosition: snapshot.position,
    })
    const player = room.findVisibleTarget(observer, 0)
    if (player?.id !== init.playerId) {
        throw new Error('Missing player in room')
    }
    return player
}

function latestSnapshot(value: FakeSocket): WorldSnapshot {
    const message = value.sent.findLast(
        (candidate) => candidate.type === 'snapshot'
    )
    if (message?.type !== 'snapshot') {
        throw new Error('Missing snapshot')
    }
    return message.snapshot
}
