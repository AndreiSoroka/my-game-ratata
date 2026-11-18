import assert from 'node:assert/strict'

import {
    CENTER_LOCATION_ID,
    type HeroClass,
    type ServerMessage,
} from '@my-game-ratata/contracts'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { advanceRevive, beginRevive } from '../src/game/characterLife'
import { GameRoom } from '../src/game/room'
import type { RoomSocket } from '../src/game/roomMessaging'
import { WorldMaps } from '../src/game/worldMaps'

beforeEach(() => vi.stubGlobal('Bun', { env: {} }))
afterEach(() => vi.unstubAllGlobals())

function socket(room: GameRoom) {
    const messages: ServerMessage[] = []
    const ws = {
        send: (data: string) =>
            messages.push(JSON.parse(data) as ServerMessage),
    } as unknown as RoomSocket
    room.handleOpen(ws)
    const join = (name: string, heroClass: HeroClass = 'ranger') => {
        room.handleMessage(
            ws,
            JSON.stringify({
                type: 'join',
                nickname: name,
                heroClass,
            })
        )
        const init = messages.findLast(
            (message) => message.type === 'world_init'
        )
        if (init?.type !== 'world_init') {
            throw new Error('No world initialization')
        }
        const actor = room.getCharacter(init.playerId)
        if (actor === undefined) {
            throw new Error('Missing joined character')
        }
        return { actor, init }
    }
    return { ws, messages, join }
}

function expectCemetery(room: GameRoom, point: { x: number; y: number }) {
    const cemetery = room.navigation.grid.cityAreas?.['cemetery']
    assert(cemetery !== undefined, 'Generated city has a cemetery')
    expect(point.x).toBeGreaterThanOrEqual(cemetery.x)
    expect(point.y).toBeGreaterThanOrEqual(cemetery.y)
    expect(point.x).toBeLessThan(cemetery.x + cemetery.width)
    expect(point.y).toBeLessThan(cemetery.y + cemetery.height)
    expect(
        room.navigation.isSolidTile(room.navigation.worldToTile(point))
    ).toBe(false)
}

it.each(['grid', 'organic', 'ring'] as const)(
    'awakens new identities on grave soil and preserves reconnect position in the %s city',
    (cityStyle) => {
        const maps = new WorldMaps({
            seed: `birth-${cityStyle}`,
            epoch: 'birth-epoch',
            cityStyle,
        })
        const room = new GameRoom(maps.navigation(CENTER_LOCATION_ID), {
            worldMaps: maps,
        })
        try {
            const first = socket(room)
            const { actor, init } = first.join('Одно имя')
            expect(first.messages[0]?.type).toBe('world_init')
            expect(init.snapshot.serverEpoch).toBe('birth-epoch')
            expect(init.map.asset).toEqual(init.snapshot.location?.map.asset)
            expectCemetery(room, actor.position)
            // A unit fixture sets a reachable point; browser checks use ordinary movement.
            const point = room.navigation.grid.cityAnchors?.['resource.fiber']
            assert(point !== undefined)
            const path = room.navigation.findPathWorld(actor.position, point)
            expect(path.length).toBeGreaterThan(0)
            actor.position = { ...point }
            room.handleClose(first.ws)
            const reconnected = socket(room)
            const same = reconnected.join('Одно имя').actor
            expect(same).toBe(actor)
            expect(same.position).toEqual(point)
            actor.applyDamage(actor.hp, 10000)
            room.handleMessage(reconnected.ws, '{"type":"abandon_life"}')
            expect(room.getCharacter(actor.id)).toBeUndefined()
            const next = reconnected.join('Одно имя').actor
            expect(next.id).not.toBe(actor.id)
            expect(next.alive).toBe(true)
            expectCemetery(room, next.position)
            expect(next.npcIdentityProfile).toBeUndefined()
        } finally {
            room.stop()
        }
    }
)

it('keeps cemetery decor separate from combat grave sources', () => {
    const maps = new WorldMaps({
        seed: 'peaceful-cemetery',
        epoch: 'cemetery-epoch',
    })
    const room = new GameRoom(maps.navigation(CENTER_LOCATION_ID), {
        worldMaps: maps,
    })
    try {
        expect(room.navigation.grid.encounters?.graves ?? []).toEqual([])
        expect(room.snapshot().graves).toEqual([])
        expect(
            room
                .snapshot()
                .characters.filter((actor) => actor.faction === 'monsters')
        ).toEqual([])
    } finally {
        room.stop()
    }
})

it('revives the same person at the body rather than creating a new cemetery identity', () => {
    const maps = new WorldMaps({
        seed: 'resurrection-body',
        epoch: 'revival-epoch',
    })
    const room = new GameRoom(maps.navigation(CENTER_LOCATION_ID), {
        worldMaps: maps,
    })
    try {
        const hero = socket(room).join('Павший').actor
        const cleric = socket(room).join('Помощница', 'cleric').actor
        const birth = { ...hero.position }
        const body = room.navigation.grid.cityAnchors?.['resource.herbs']
        assert(body !== undefined)
        hero.position = { ...body }
        const nearby = room.navigation
            .walkableNeighbors(room.navigation.worldToTile(body))
            .map((tile) => room.navigation.tileToWorld(tile))
            .find((point) => room.navigation.hasLineOfSight(point, body))
        if (nearby === undefined) {
            throw new Error('No visible rescue position')
        }
        cleric.position = nearby
        const now = Date.now()
        hero.applyDamage(hero.hp, now)
        const context = room.abilityContextFor(cleric, now)
        expect(beginRevive(cleric, hero, now, context)).toBe(true)
        const completedAt = cleric.abilities.casting?.completesAt
        assert(completedAt !== undefined)
        const events = advanceRevive(
            cleric,
            (id) => room.getCharacter(id),
            completedAt,
            () => 0,
            { ...context, now: completedAt }
        )
        expect(events.some((event) => event.kind === 'revive')).toBe(true)
        expect(room.getCharacter(hero.id)).toBe(hero)
        expect(hero.alive).toBe(true)
        expect(hero.position).toEqual(body)
        expect(hero.position).not.toEqual(birth)
    } finally {
        room.stop()
    }
})
