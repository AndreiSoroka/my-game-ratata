import type { ItemId } from '@my-game-ratata/contracts'
import {
    CENTER_LOCATION_ID,
    INVENTORY_CAPACITY,
} from '@my-game-ratata/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { parseAgentDecision } from '../src/game/agentDecisions'
import type { GameCharacter } from '../src/game/character'
import { createItemInstance } from '../src/game/inventory'
import { parseClientMessage } from '../src/game/messages'
import { GameRoom } from '../src/game/room'
import { WorldInventory } from '../src/game/worldInventory'
import { dropPosition } from '../src/game/worldInventoryHelpers'
import {
    chestHero,
    chestNavigation,
    joinChestRoom,
    now,
} from './chestTestHelpers'

afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

describe('socket selected pickup target', () => {
    it('takes the shown item in front even when another item is closer behind', () => {
        const { room, player, front, behind } = roomDrops()
        room.handleMessage(
            player.socket,
            JSON.stringify({
                type: 'pickup_item',
                worldItemId: front.id,
                actorId: 'another',
            })
        )
        expect(player.actor.inventory.map((item) => item.itemId)).toEqual([
            'boots',
        ])
        expect(room.snapshot(now).items).toEqual([behind])
        room.handleMessage(
            player.socket,
            JSON.stringify({ type: 'pickup_item', worldItemId: front.id })
        )
        expect(player.actor.inventory.map((item) => item.itemId)).toEqual([
            'boots',
        ])
        expect(room.snapshot(now).items).toEqual([behind])
        expect(
            player.sent.flatMap((message) =>
                message.type === 'event' && message.event.audioCue !== undefined
                    ? [message.event.audioCue]
                    : []
            )
        ).toMatchObject([
            { effect: 'drop', position: front.position },
            { effect: 'drop', position: behind.position },
            { effect: 'pickup', position: front.position },
        ])
        room.stop()
    })

    it('gives the same exact pickup to an authorized NPC controller', () => {
        const { room, front, behind } = roomDrops()
        const npc = room.getCharacter('npc_veteran_1')
        if (npc === undefined) {
            throw new Error('Expected veteran')
        }
        npc.position = { x: 105, y: 118 }
        const before = [...npc.inventory]
        const result = room.decideForAgent(npc.id, {
            type: 'pickup_item',
            worldItemId: front.id,
        })
        expect(result.accepted).toBe(true)
        expect(result.events).toContainEqual({
            kind: 'item_pickup',
            actorId: npc.id,
            itemId: 'boots',
        })
        expect(npc.inventory).toHaveLength(before.length + 1)
        expect(npc.inventory.at(-1)?.itemId).toBe('boots')
        expect(room.snapshot(now).items).toEqual([behind])
        room.stop()
    })
})

describe('selected loose item lookup', () => {
    it('never falls back after the selected item is missing, stale or outside range', () => {
        const { actor, inventory, drop } = fixture()
        const near = drop('food', { x: 99, y: 100 })
        const far = drop('boots', { x: 125, y: 100 })
        expect(inventory.pickupItem(actor, 'missing', now)).toEqual([])
        expect(inventory.pickupItem(actor, far.id, now)).toEqual([])
        const other = chestHero('other', near.position)
        inventory.pickupItem(other, near.id, now)
        const replacement = drop('simple_sword', { x: 99, y: 100 })
        expect(inventory.pickupItem(actor, near.id, now)).toEqual([])
        expect(actor.inventory).toEqual([])
        expect(inventory.snapshotItems()).toEqual([far, replacement])
    })

    it.each([
        { distance: 24, allowed: true },
        { distance: 24.001, allowed: false },
    ])(
        'revalidates actual range at $distance pixels',
        ({ distance, allowed }) => {
            const { actor, inventory, drop } = fixture()
            const selected = drop('boots', { x: 100 + distance, y: 100 })
            const other = drop('food', { x: 99, y: 100 })
            expect(inventory.pickupItem(actor, selected.id, now)).toHaveLength(
                allowed ? 1 : 0
            )
            expect(actor.inventory.map((item) => item.itemId)).toEqual(
                allowed ? ['boots'] : []
            )
            expect(
                inventory.snapshotItems().some((item) => item.id === other.id)
            ).toBe(true)
        }
    )

    it('preserves the old nearest lookup when no target ID was supplied', () => {
        const { actor, inventory, drop } = fixture()
        const front = drop('boots', { x: 120, y: 100 })
        drop('food', { x: 95, y: 100 })
        expect(inventory.pickupNearestItem(actor)[0]?.itemId).toBe('food')
        expect(actor.inventory.map((item) => item.itemId)).toEqual(['food'])
        expect(inventory.snapshotItems()).toEqual([front])
        expect(inventory.pickupItem(actor, undefined, now)[0]?.itemId).toBe(
            'boots'
        )
    })

    it('does not lose a selected item when the inventory is full', () => {
        const { actor, inventory, drop } = fixture()
        const selected = drop('boots', { x: 120, y: 100 })
        actor.inventory = Array.from({ length: INVENTORY_CAPACITY }, () =>
            createItemInstance('food')
        )
        expect(inventory.pickupItem(actor, selected.id, now)).toEqual([])
        expect(inventory.snapshotItems()).toEqual([selected])
        actor.inventory.pop()
        expect(inventory.pickupItem(actor, selected.id, now)).toHaveLength(1)
        expect(actor.inventory.at(-1)?.itemId).toBe('boots')
        expect(inventory.snapshotItems()).toEqual([])
    })
})

describe('pickup location and actor authority', () => {
    it('uses location-scoped IDs and does not reuse an old map target on another map', () => {
        const first = fixture(CENTER_LOCATION_ID)
        const second = fixture('map-1-2')
        const old = first.drop('boots', { x: 100, y: 100 })
        const local = second.drop('food', { x: 100, y: 100 })
        expect(old.id).not.toBe(local.id)
        first.actor.locationId = 'map-1-2'
        expect(first.inventory.pickupItem(first.actor, old.id, now)).toEqual([])
        expect(second.inventory.pickupItem(first.actor, old.id, now)).toEqual(
            []
        )
        expect(second.inventory.snapshotItems()).toEqual([local])
        expect(first.inventory.snapshotItems()).toEqual([old])
        expect(
            second.inventory.pickupItem(first.actor, local.id, now)[0]?.itemId
        ).toBe('food')
    })

    it.each([
        'dead',
        'offline',
        'retired',
        'stunned',
        'locked',
        'other-map',
    ] as const)('rejects unavailable actors: %s', (reason) => {
        const { actor, inventory, drop } = fixture()
        const selected = drop('boots', { x: 100, y: 100 })
        invalidate(actor, reason)
        expect(inventory.pickupItem(actor, selected.id, now)).toEqual([])
        expect(actor.inventory).toEqual([])
        expect(inventory.snapshotItems()).toEqual([selected])
    })
})

describe('optional pickup target boundary', () => {
    it('keeps no-ID compatibility and strips fabricated owners, ranges and loot', () => {
        expect(parseClientMessage('{"type":"pickup_item"}').message).toEqual({
            type: 'pickup_item',
        })
        expect(parseAgentDecision({ type: 'pickup_item' })).toEqual({
            type: 'pickup_item',
        })
        const input = {
            type: 'pickup_item',
            worldItemId: 'map-2-2:world_item_1',
            actorId: 'victim',
            range: 999,
            items: ['boots'],
        }
        const expected = { type: 'pickup_item', worldItemId: input.worldItemId }
        expect(parseClientMessage(JSON.stringify(input)).message).toEqual(
            expected
        )
        expect(parseAgentDecision(input)).toEqual(expected)
    })

    it.each([null, 1, '', '  ', 'x'.repeat(101), true, []])(
        'rejects malformed explicit target %j instead of treating it as nearest',
        (worldItemId) => {
            const input = { type: 'pickup_item', worldItemId }
            expect(
                parseClientMessage(JSON.stringify(input)).message
            ).toBeUndefined()
            expect(parseAgentDecision(input)).toBeUndefined()
        }
    )
})

function fixture(locationId: string = CENTER_LOCATION_ID) {
    const inventory = new WorldInventory(chestNavigation(locationId))
    const actor = chestHero('hero', { x: 100, y: 100 })
    actor.locationId = locationId
    let dropIndex = 1
    return {
        actor,
        inventory,
        drop: (itemId: ItemId, position: { x: number; y: number }) => {
            const offset = dropPosition({ x: 0, y: 0 }, dropIndex++)
            const giver = chestHero('giver', {
                x: position.x - offset.x,
                y: position.y - offset.y,
            })
            const instance = createItemInstance(itemId)
            giver.inventory.push(instance)
            inventory.applyInventoryAction(giver, 'drop', instance.instanceId)
            const item = inventory.snapshotItems().at(-1)
            if (item === undefined) {
                throw new Error('Expected dropped item')
            }
            return item
        },
    }
}

function roomDrops() {
    vi.stubGlobal('Bun', { env: {} })
    const room = new GameRoom(chestNavigation('pickup-test'))
    const player = joinChestRoom(room, 'Picker')
    player.actor.position = { x: 100, y: 100 }
    for (const itemId of ['boots', 'food'] as const) {
        const instance = createItemInstance(itemId)
        player.actor.inventory.push(instance)
        room.handleMessage(
            player.socket,
            JSON.stringify({
                type: 'inventory_action',
                action: 'drop',
                itemInstanceId: instance.instanceId,
            })
        )
    }
    const [front, behind] = room.snapshot(now).items
    if (front === undefined || behind === undefined) {
        throw new Error('Expected two floor items')
    }
    player.actor.position = { x: 105, y: 118 }
    player.actor.facing = 'right'
    return { room, player, front, behind }
}

function invalidate(
    actor: GameCharacter,
    reason: 'dead' | 'offline' | 'retired' | 'stunned' | 'locked' | 'other-map'
) {
    switch (reason) {
        case 'dead':
            actor.alive = false
            break
        case 'offline':
            actor.tags.add('offline')
            break
        case 'retired':
            actor.tags.add('state.retired')
            break
        case 'stunned':
            actor.stunUntil = now + 1
            break
        case 'locked':
            actor.actionLockUntil = now + 1
            break
        case 'other-map':
            actor.locationId = 'map-1-2'
            break
    }
}
