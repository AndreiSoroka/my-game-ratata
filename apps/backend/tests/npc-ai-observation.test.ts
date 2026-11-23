import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { buildNpcAiObservation } from '../src/ai/observation'
import type { GameCharacter } from '../src/game/character'
import { readMapBuildings } from '../src/game/mapBuildings'
import {
    loadNavigationService,
    NavigationService,
} from '../src/game/navigation'
import { GameRoom } from '../src/game/room'

const rooms: GameRoom[] = []

beforeEach(() => {
    vi.stubGlobal('Bun', { env: {} })
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
})

afterEach(() => {
    for (const room of rooms.splice(0)) {
        room.stop()
    }
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

function openRoom(navigation = loadNavigationService()) {
    const room = new GameRoom(navigation)
    rooms.push(room)
    return room
}

function npc(room: GameRoom, id: string): GameCharacter {
    const actor = room.getCharacter(id)
    if (actor === undefined) {
        throw new Error(`Missing authored NPC ${id}`)
    }
    return actor
}

it('keeps stock and hidden residents out of initial Kaplya context but exposes authored entrances', () => {
    const room = openRoom()
    const actor = npc(room, 'npc_magic_slime_1')
    const observation = buildNpcAiObservation(
        room,
        actor,
        'companion',
        Date.now()
    )
    expect(observation.market).toBeUndefined()
    expect(observation.shop).toBeUndefined()
    expect(observation.city).toBeUndefined()
    expect(observation.dialogue).toBeNull()
    expect(
        observation.targets.some((target) => target.id === 'npc_merchant_1')
    ).toBe(false)
    const shop = observation.targets.find(
        (target) => target.kind === 'building' && target.name === 'Лавка Саввы'
    )
    expect(shop).toMatchObject({
        position: { x: 648, y: 1032 },
        commands: [
            { type: 'move_to', target: { x: 648, y: 1032 } },
            { type: 'move_to', target: { x: 648, y: 968 } },
            { type: 'guide', targetKey: shop?.key },
        ],
    })
    expect(shop?.details).not.toHaveProperty('residents')
    expect(observation.self.health.kind).toBe('percent')
    expect(observation.self.resources.energy.kind).toBe('percent')
    expect(observation.self).not.toHaveProperty('stats')
    expect(observation.capabilities?.navigation).toEqual({
        mapCollision: true,
        automaticEnemyAvoidance: false,
        conditionalDangerTriggers: false,
    })
})

it('learns merchant stock through an ordinary physical trip and loses the live view after leaving', () => {
    const room = openRoom()
    const actor = npc(room, 'npc_magic_slime_1')
    const merchant = npc(room, 'npc_merchant_1')
    const navigation = room.navigationFor(actor)
    const shop = navigation.grid.buildings?.find(
        (building) => building.name === 'Лавка Саввы'
    )
    if (shop === undefined) {
        throw new Error('Missing authored shop')
    }
    // Arrange the fixture outside the doorway. Entry, inspection and exit still use normal commands.
    const outside = {
        x: shop.entry.x,
        y: shop.bounds.y + shop.bounds.height + navigation.grid.tileHeight / 2,
    }
    actor.position = { ...outside }
    room.start()
    const observe = () =>
        buildNpcAiObservation(room, actor, 'companion', Date.now())
    expect(observe().targets.some((target) => target.id === merchant.id)).toBe(
        false
    )
    expect(
        room.decideForAgent(actor.id, {
            type: 'interact',
            targetId: merchant.id,
        }).accepted
    ).toBe(false)
    expect(
        room.decideForAgent(actor.id, {
            type: 'move_to',
            target: shop.interior,
        }).accepted
    ).toBe(true)
    vi.advanceTimersByTime(2_000)
    expect(actor.position).toEqual(shop.interior)

    const before = observe()
    expect(before.market).toBeUndefined()
    expect(
        before.targets.find((target) => target.id === merchant.id)?.commands
    ).toContainEqual({ type: 'interact', targetId: merchant.id })
    expect(
        room.decideForAgent(actor.id, {
            type: 'interact',
            targetId: merchant.id,
        }).accepted
    ).toBe(true)
    const after = observe()
    expect(after.market).toMatchObject({ cityId: CENTER_LOCATION_ID })
    expect(after.market?.rows.some((row) => row.itemId === 'food')).toBe(true)
    expect(after.dialogue?.npcId).toBe(merchant.id)
    expect(
        room.decideForAgent(actor.id, {
            type: 'move_to',
            target: outside,
        }).accepted
    ).toBe(true)
    vi.advanceTimersByTime(2_000)
    expect(actor.position).toEqual(outside)
    const left = observe()
    expect(left.market).toBeUndefined()
    expect(left.shop).toBeUndefined()
})

it('hides an indoor resident even through an open doorway until the observer enters', () => {
    const navigation = new NavigationService({
        id: CENTER_LOCATION_ID,
        width: 96,
        height: 80,
        tileWidth: 16,
        tileHeight: 16,
        solidLayerNames: [],
        solid: new Array<boolean>(96 * 80).fill(false),
        buildings: [
            {
                id: 'test-shop',
                name: 'Test shop',
                bounds: { x: 100, y: 100, width: 100, height: 100 },
                entry: { x: 120, y: 200 },
                interior: { x: 120, y: 180 },
            },
        ],
    })
    const room = openRoom(navigation)
    const actor = npc(room, 'npc_magic_slime_1')
    const merchant = npc(room, 'npc_merchant_1')
    actor.position = { x: 120, y: 220 }
    merchant.position = { x: 120, y: 180 }
    expect(navigation.hasLineOfSight(actor.position, merchant.position)).toBe(
        true
    )
    expect(
        buildNpcAiObservation(
            room,
            actor,
            'companion',
            Date.now()
        ).targets.some((target) => target.id === merchant.id)
    ).toBe(false)
    actor.position = { x: 120, y: 190 }
    merchant.inventory.push({ instanceId: 'private-stock', itemId: 'food' })
    const target = buildNpcAiObservation(
        room,
        actor,
        'companion',
        Date.now()
    ).targets.find((entry) => entry.id === merchant.id)
    expect(target).toBeDefined()
    expect(target).not.toHaveProperty('inventory')
    expect(target?.details).not.toHaveProperty('inventory')
    expect(target?.details).not.toHaveProperty('resources')
})

it('respects walls, stealth perception, location and returned-value isolation', () => {
    const room = openRoom()
    const actor = npc(room, 'npc_magic_slime_1')
    const merchant = npc(room, 'npc_merchant_1')
    actor.position = { x: 648, y: 968 }
    merchant.position = { x: 680, y: 968 }
    const observation = buildNpcAiObservation(
        room,
        actor,
        'companion',
        Date.now()
    )
    expect(observation.targets.some((entry) => entry.id === merchant.id)).toBe(
        true
    )
    observation.self.position.x = 9999
    expect(actor.position.x).toBe(648)
    vi.spyOn(room.navigationFor(actor), 'hasLineOfSight').mockReturnValue(false)
    expect(
        buildNpcAiObservation(
            room,
            actor,
            'companion',
            Date.now()
        ).targets.some((entry) => entry.id === merchant.id)
    ).toBe(false)
})

it('applies shared stealth perception and excludes another location', () => {
    const room = openRoom()
    const actor = npc(room, 'npc_magic_slime_1')
    const merchant = npc(room, 'npc_merchant_1')
    actor.position = { x: 648, y: 800 }
    actor.facing = 'down'
    merchant.position = { x: 648, y: 640 }
    merchant.movement.mode = 'sneaking'
    const observesMerchant = () =>
        buildNpcAiObservation(
            room,
            actor,
            'companion',
            Date.now()
        ).targets.some((entry) => entry.id === merchant.id)
    expect(observesMerchant()).toBe(false)
    merchant.movement.mode = 'walking'
    expect(observesMerchant()).toBe(true)
    merchant.locationId = 'map-2-1'
    expect(observesMerchant()).toBe(false)
})

it('gives Mira the finite city ledger and published requests only in her city', () => {
    const room = openRoom()
    const actor = npc(room, 'npc_friendly_girl_1')
    const list = vi.spyOn(room.workerRequests, 'list')
    const before = room
        .adventureForWorkers()
        .economy.snapshot(CENTER_LOCATION_ID, Date.now())
    const observation = buildNpcAiObservation(
        room,
        actor,
        'city_coordinator',
        Date.now()
    )
    expect(observation.city?.market).toEqual(before)
    expect(list).toHaveBeenCalledWith(CENTER_LOCATION_ID)
    expect(observation.city?.requests).toEqual([])
    expect(observation.market).toBeUndefined()
    if (observation.city?.market?.rows[0] !== undefined) {
        observation.city.market.rows[0].stock = 9999
    }
    expect(
        room
            .adventureForWorkers()
            .economy.snapshot(CENTER_LOCATION_ID, Date.now())
    ).toEqual(before)
    actor.locationId = 'map-2-1'
    expect(
        buildNpcAiObservation(room, actor, 'city_coordinator', Date.now()).city
    ).toBeUndefined()
})

it('validates authored building metadata without copying coordinates into NPC rules', () => {
    expect(
        loadNavigationService().grid.buildings?.find(
            (building) => building.name === 'Лавка Саввы'
        )
    ).toMatchObject({
        entry: { x: 648, y: 1032 },
        interior: { x: 648, y: 968 },
    })
    expect(() =>
        readMapBuildings({
            width: 10,
            height: 10,
            tilewidth: 16,
            tileheight: 16,
            layers: [
                {
                    name: 'Buildings',
                    type: 'objectgroup',
                    objects: [
                        {
                            id: 1,
                            name: 'Invalid',
                            type: 'building',
                            x: 1,
                            y: 1,
                            width: 20,
                            height: 20,
                            properties: [
                                { name: 'entryX', value: 'not-a-number' },
                            ],
                        },
                    ],
                },
            ],
        })
    ).toThrow('Invalid building property')
})
