import type { ServerMessage, Vector2 } from '@my-game-ratata/contracts'
import {
    CENTER_LOCATION_ID,
    CHEST_INTERACTION_RANGE,
    chestInteractionDistance,
} from '@my-game-ratata/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
    applyAgentDecision,
    type CompanionWorld,
    parseAgentDecision,
} from '../src/game/agentDecisions'
import { GameCharacter } from '../src/game/character'
import {
    chestHasLineOfSight,
    createWorldChests,
} from '../src/game/chestInteraction'
import { createItemInstance, inventoryCapacity } from '../src/game/inventory'
import { parseClientMessage } from '../src/game/messages'
import { NavigationService } from '../src/game/navigation'
import { GameRoom } from '../src/game/room'
import type { RoomSocket } from '../src/game/roomMessaging'
import { WorldInventory } from '../src/game/worldInventory'

const chestId = 'chest_forest_1'
const chestPosition = { x: 104, y: 72 }
const now = 10_000

afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

it('moves blocked legacy chests to distinct walkable tiles while preserving their loot and IDs', () => {
    const width = 96
    const height = 80
    const markers = [
        { x: 50, y: 43 },
        { x: 20, y: 20 },
        { x: 74, y: 20 },
        { x: 20, y: 60 },
        { x: 74, y: 60 },
    ]
    const solid = Array<boolean>(width * height).fill(false)
    for (const marker of markers.slice(0, 2)) {
        solid[marker.y * width + marker.x] = true
    }
    const nav = new NavigationService({
        id: 'chest-spawns',
        width,
        height,
        tileWidth: 16,
        tileHeight: 16,
        solid,
        solidLayerNames: [],
    })
    const chests = [...createWorldChests(nav, nav.grid.id, () => 0).values()]
    expect(chests.map((chest) => chest.id)).toEqual(
        markers.map((_, index) => `chest_forest_${String(index + 1)}`)
    )
    expect(
        chests.map((chest) => chest.contents.map((item) => item.itemId))
    ).toEqual([
        ['food'],
        ...markers.slice(1).map(() => ['simple_sword', 'food', 'boots']),
    ])
    const positions = chests.map((chest) => nav.worldToTile(chest.position))
    expect(
        new Set(positions.map(({ x, y }) => `${String(x)},${String(y)}`)).size
    ).toBe(markers.length)
    expect(positions.slice(2)).toEqual(markers.slice(2))
    expect(positions.some((position) => nav.isSolidTile(position))).toBe(false)
})

describe('authoritative explicit chest opening', () => {
    it('opens a shared container without attacking or automatically filling inventory', () => {
        const { actor, inventory } = fixture()
        actor.inventory = Array.from({ length: inventoryCapacity }, () =>
            createItemInstance('food')
        )
        const before = [...actor.inventory]
        const energy = actor.energy

        expect(inventory.openChestById(actor, chestId, now)).toEqual([
            { actorId: actor.id, chestId, kind: 'chest_open' },
        ])
        expect(actor.inventory).toEqual(before)
        expect(actor.energy).toBe(energy)
        expect(actor.pendingAttack).toBeUndefined()
        expect(actor.attackZones).toEqual([])
        expect(inventory.snapshotChests()[0]).toMatchObject({
            state: 'open',
            itemCount: 3,
        })
        expect(inventory.snapshotItems()).toEqual([])
        expect(inventory.containers.snapshot(actor, now)?.items).toHaveLength(3)
        const stranger = hero('stranger', actor.position)
        expect(inventory.openChestById(stranger, chestId, now)).toEqual([])
        actor.attackZones = [zone()]
        expect(inventory.openChestsHitBy(actor)).toEqual([
            { actorId: actor.id, chestId, kind: 'chest_open' },
        ])
        const drops = inventory.snapshotItems()
        expect(drops).toHaveLength(3)
        expect(inventory.containers.snapshot(actor, now)).toBeNull()
        expect(inventory.containers.snapshot(stranger, now)).toBeNull()
        expect(inventory.openChestsHitBy(actor)).toEqual([])
        expect(inventory.snapshotItems()).toEqual(drops)
    })

    it('reopens an empty container and transfers newly stashed items once', () => {
        const { actor, inventory } = fixture(0.99)
        expect(inventory.openChestById(actor, chestId, now)[0]?.kind).toBe(
            'chest_open'
        )
        expect(inventory.snapshotItems()).toEqual([])
        expect(inventory.openChestById(actor, chestId, now)).toEqual([])
        actor.position = { x: 88, y: 72 }
        const food = createItemInstance('food')
        actor.inventory.push(food)
        expect(
            inventory.applyInventoryAction(actor, 'stash', food.instanceId)[0]
                ?.kind
        ).toBe('item_stash')
        expect(inventory.snapshotChests()[0]?.state).toBe('open')
        expect(inventory.openChestById(actor, chestId, now)).toEqual([])
        expect(inventory.containers.snapshot(actor, now)?.items).toEqual([food])
        expect(
            inventory.containers.handle(
                actor,
                { type: 'take_all_chest_items', chestId },
                now
            )[0]?.kind
        ).toBe('item_pickup')
        expect(actor.inventory).toEqual([food])
        expect(
            inventory.containers.handle(
                actor,
                { type: 'take_all_chest_items', chestId },
                now
            )
        ).toEqual([])
        expect(inventory.snapshotItems()).toEqual([])
    })

    it.each([
        { dx: 36, dy: 0, allowed: true },
        { dx: 37, dy: 0, allowed: false },
        { dx: 27, dy: 27, allowed: true },
        { dx: 28, dy: 28, allowed: false },
    ])('uses the real footprint at offset ($dx,$dy)', ({ dx, dy, allowed }) => {
        const { actor, inventory } = fixture()
        actor.position = { x: chestPosition.x - dx, y: chestPosition.y - dy }
        expect(
            chestInteractionDistance(actor.position, chestPosition) <=
                CHEST_INTERACTION_RANGE
        ).toBe(allowed)
        const events = inventory.openChestById(actor, chestId, now)
        expect(events[0]?.kind).toBe(allowed ? 'chest_open' : 'notice')
        expect(inventory.snapshotChests()[0]?.state).toBe(
            allowed ? 'open' : 'closed'
        )
    })

    it.each(unavailableActors())(
        'rejects $name without changing the chest',
        ({ mutate }) => {
            const { actor, inventory } = fixture()
            mutate(actor)
            expect(inventory.openChestById(actor, chestId, now)).toEqual([
                expect.objectContaining({
                    kind: 'notice',
                    actorId: actor.id,
                    audienceIds: [actor.id],
                }),
            ])
            expect(inventory.snapshotChests()[0]).toMatchObject({
                state: 'closed',
                itemCount: 3,
            })
            expect(inventory.snapshotItems()).toEqual([])
            expect(actor.inventory).toEqual([])
        }
    )

    it('keeps unknown IDs private and never opens another chest as fallback', () => {
        const { actor, inventory } = fixture()
        expect(inventory.openChestById(actor, 'missing', now)[0]).toMatchObject(
            {
                kind: 'notice',
                actorId: actor.id,
                audienceIds: [actor.id],
            }
        )
        expect(inventory.snapshotChests()[0]?.state).toBe('closed')
    })
})

describe('chest exterior-edge visibility', () => {
    it.each([
        { x: 5, y: 4 },
        { x: 7, y: 4 },
        { x: 6, y: 3 },
        { x: 6, y: 5 },
    ])('allows a real walkable approach ($x,$y) to the solid chest', (tile) => {
        const { actor, inventory, navigation } = fixture()
        navigation.grid.solid[4 * 20 + 6] = true
        actor.position = navigation.tileToWorld(tile)
        expect(
            navigation.isSolidTile(navigation.worldToTile(actor.position))
        ).toBe(false)
        expect(inventory.openChestById(actor, chestId, now)[0]?.kind).toBe(
            'chest_open'
        )
    })

    it('rejects opening through a wall for both explicit and legacy melee paths', () => {
        const { actor, inventory, navigation } = fixture()
        actor.position = { x: 72, y: 72 }
        navigation.grid.solid[4 * 20 + 5] = true
        navigation.grid.solid[4 * 20 + 6] = true
        expect(chestInteractionDistance(actor.position, chestPosition)).toBe(24)
        expect(inventory.openChestById(actor, chestId, now)[0]?.kind).toBe(
            'notice'
        )
        actor.attackZones = [zone()]
        expect(inventory.openChestsHitBy(actor)).toEqual([])
        expect(inventory.snapshotChests()[0]?.state).toBe('closed')
        expect(inventory.snapshotItems()).toEqual([])
    })

    it('requires the visible edge itself to be in interaction range', () => {
        const { actor, inventory, navigation } = fixture()
        actor.position = { x: 68, y: 72 }
        vi.spyOn(navigation, 'hasLineOfSight').mockImplementation(
            (_from, to) => to.x > chestPosition.x
        )
        expect(chestInteractionDistance(actor.position, chestPosition)).toBe(28)
        expect(
            chestHasLineOfSight(actor.position, chestPosition, navigation)
        ).toBe(true)
        expect(inventory.openChestById(actor, chestId, now)[0]?.kind).toBe(
            'notice'
        )
        expect(inventory.snapshotChests()[0]?.state).toBe('closed')
    })

    it('preserves legacy attack-zone reach beyond explicit interaction range', () => {
        const { actor, inventory } = fixture()
        actor.position = { x: 56, y: 72 }
        actor.attackZones = [zone()]
        actor.actionLockUntil = now + 100
        expect(inventory.openChestById(actor, chestId, now)[0]?.kind).toBe(
            'notice'
        )
        expect(inventory.openChestsHitBy(actor)).toEqual([
            { actorId: actor.id, chestId, kind: 'chest_open' },
        ])
    })
})

describe('untrusted player and agent chest commands', () => {
    it.each([undefined, null, 1, '', '   ', 'x'.repeat(101)])(
        'rejects invalid chest ID %s at both boundaries',
        (id) => {
            const input = { type: 'open_chest', chestId: id }
            expect(
                parseClientMessage(JSON.stringify(input)).message
            ).toBeUndefined()
            expect(parseAgentDecision(input)).toBeUndefined()
        }
    )

    it('parses only the chest ID, dropping claimed actor IDs, rewards and position', () => {
        const input = {
            type: 'open_chest',
            chestId,
            actorId: 'victim',
            rewards: ['food'],
            position: chestPosition,
        }
        const expected = { type: 'open_chest', chestId }
        expect(parseClientMessage(JSON.stringify(input)).message).toEqual(
            expected
        )
        expect(parseAgentDecision(input)).toEqual(expected)
    })

    it('uses the shared inventory for NPC decisions and protects human controllers', () => {
        const { actor, inventory, navigation } = fixture()
        const npc = hero('npc', actor.position, 'mob1')
        const world: CompanionWorld = {
            chestActions: {
                handle: (character, message, at) =>
                    inventory.containers.handle(character, message, at),
                snapshot: (character, at) =>
                    inventory.containers.snapshot(character, at),
            },
            findVisibleTarget: () => undefined,
            getCharacter: () => undefined,
            navigationFor: () => navigation,
            requestAttack: () => undefined,
        }
        const result = applyAgentDecision(
            npc,
            { type: 'open_chest', chestId },
            world,
            now
        )
        expect(result).toMatchObject({
            accepted: true,
            events: [{ actorId: npc.id, chestId, kind: 'chest_open' }],
        })
        expect(inventory.snapshotItems()).toEqual([])
        expect(result.chest?.items).toHaveLength(3)
        expect(npc.inventory).toEqual([])
        expect(
            applyAgentDecision(
                actor,
                { type: 'open_chest', chestId },
                world,
                now
            )
        ).toMatchObject({ accepted: false, events: [] })
        const claimedHuman = hero('human-owned-npc', actor.position, 'mob1')
        claimedHuman.soul.controlSource = 'human'
        expect(
            applyAgentDecision(
                claimedHuman,
                { type: 'open_chest', chestId },
                world,
                now
            ).accepted
        ).toBe(false)
    })
})

describe('socket chest command integration', () => {
    it('resolves socket actor and location, keeps contents private, and requires a container take', () => {
        vi.stubGlobal('Bun', { env: {} })
        vi.spyOn(Math, 'random').mockReturnValue(0)
        const room = new GameRoom(navigation('chest-test'))
        const far = join(room, 'Far')
        const near = join(room, 'Near')
        far.actor.position = { x: 8, y: 8 }
        near.actor.position = { x: 88, y: 72 }
        room.handleMessage(
            far.socket,
            JSON.stringify({
                type: 'open_chest',
                chestId,
                actorId: near.actor.id,
            })
        )
        expect(openEvents(near.sent)).toEqual([])
        expect(
            far.sent.some(
                (message) =>
                    message.type === 'event' && message.event.kind === 'notice'
            )
        ).toBe(true)
        expect(
            near.sent.some(
                (message) =>
                    message.type === 'event' && message.event.kind === 'notice'
            )
        ).toBe(false)
        room.handleMessage(
            near.socket,
            JSON.stringify({ type: 'open_chest', chestId })
        )
        room.handleMessage(
            near.socket,
            JSON.stringify({ type: 'open_chest', chestId })
        )
        expect(openEvents(near.sent)).toEqual([
            { actorId: near.actor.id, chestId, kind: 'chest_open' },
        ])
        expect(near.actor.inventory).toEqual([])
        far.actor.locationId = 'map-1-2'
        far.actor.position = { ...near.actor.position }
        room.handleMessage(
            far.socket,
            JSON.stringify({ type: 'open_chest', chestId })
        )
        expect(openEvents(far.sent)).toHaveLength(2)
        expect(openEvents(near.sent)).toHaveLength(1)
        const privateView = room.snapshot(
            now,
            near.actor.locationId,
            near.actor.id
        )
        expect(privateView.chest?.items).toHaveLength(3)
        expect(room.snapshot(now, near.actor.locationId).chest).toBeUndefined()
        room.handleMessage(near.socket, JSON.stringify({ type: 'pickup_item' }))
        expect(near.actor.inventory).toEqual([])
        room.handleMessage(
            near.socket,
            JSON.stringify({ type: 'take_all_chest_items', chestId })
        )
        expect(near.actor.inventory).toHaveLength(3)
        expect(room.snapshot(now, near.actor.locationId).items).toEqual([])
        expect(far.actor.inventory).toEqual([])
        room.stop()
    })
})

function fixture(random = 0) {
    vi.spyOn(Math, 'random').mockReturnValue(random)
    const nav = navigation()
    return {
        actor: hero('hero', { x: 88, y: 72 }),
        inventory: new WorldInventory(nav),
        navigation: nav,
    }
}

function navigation(id = CENTER_LOCATION_ID) {
    return new NavigationService({
        id,
        width: 20,
        height: 20,
        tileWidth: 16,
        tileHeight: 16,
        solid: Array<boolean>(400).fill(false),
        solidLayerNames: [],
    })
}

function hero(
    id: string,
    position: Vector2,
    controllerKind: GameCharacter['controllerKind'] = 'network_player'
) {
    return new GameCharacter({
        id,
        archetype: 'human',
        controllerKind,
        nickname: id,
        spawnPosition: position,
        faction: 'peaceful',
    })
}

function zone() {
    return { ownerId: 'hero', minX: 96, maxX: 112, minY: 64, maxY: 80 }
}

function unavailableActors() {
    return [
        {
            name: 'dead',
            mutate: (actor: GameCharacter) => {
                actor.alive = false
            },
        },
        {
            name: 'offline',
            mutate: (actor: GameCharacter) => {
                actor.tags.add('offline')
            },
        },
        {
            name: 'retired',
            mutate: (actor: GameCharacter) => {
                actor.tags.add('state.retired')
            },
        },
        {
            name: 'stunned',
            mutate: (actor: GameCharacter) => {
                actor.stunUntil = now + 1
            },
        },
        {
            name: 'action locked',
            mutate: (actor: GameCharacter) => {
                actor.actionLockUntil = now + 1
            },
        },
        {
            name: 'other location',
            mutate: (actor: GameCharacter) => {
                actor.locationId = 'map-1-2'
            },
        },
        {
            name: 'far away',
            mutate: (actor: GameCharacter) => {
                actor.position = { x: 8, y: 8 }
            },
        },
    ]
}

function join(room: GameRoom, nickname: string) {
    const sent: ServerMessage[] = []
    const socket = {
        send(payload: string) {
            sent.push(JSON.parse(payload) as ServerMessage)
        },
    } as RoomSocket
    room.handleOpen(socket)
    room.handleMessage(socket, JSON.stringify({ type: 'join', nickname }))
    const init = sent.find((message) => message.type === 'world_init')
    if (init === undefined) {
        throw new Error('Join did not initialize the world')
    }
    const actor = room.getCharacter(init.playerId)
    if (actor === undefined) {
        throw new Error('Joined actor missing')
    }
    return { actor, sent, socket }
}

function openEvents(sent: ServerMessage[]) {
    return sent.flatMap((message) =>
        message.type === 'event' && message.event.kind === 'chest_open'
            ? [message.event]
            : []
    )
}
