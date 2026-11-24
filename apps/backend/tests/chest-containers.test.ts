import { CHEST_CAPACITY, INVENTORY_CAPACITY } from '@my-game-ratata/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { parseAgentDecision } from '../src/game/agentDecisions'
import { createItemInstance } from '../src/game/inventory'
import { parseClientMessage } from '../src/game/messages'
import { advanceCharacter } from '../src/game/movement'
import { chestFixture, chestHero, chestId, now } from './chestTestHelpers'

afterEach(() => {
    vi.restoreAllMocks()
})

describe('atomic shared chest transfers', () => {
    it('transfers the selected real instance to only the first concurrent viewer', () => {
        const { actor, inventory } = chestFixture()
        const other = chestHero('other')
        inventory.openChestById(actor, chestId, now)
        inventory.openChestById(other, chestId, now)
        const items = inventory.containers.snapshot(actor, now)?.items
        const chosen = items?.[1]
        if (chosen === undefined) {
            throw new Error('Expected chest items')
        }
        const command = {
            type: 'take_chest_item',
            chestId,
            itemInstanceId: chosen.instanceId,
        } as const
        expect(inventory.containers.handle(actor, command, now)).toEqual([
            {
                kind: 'item_pickup',
                actorId: actor.id,
                chestId,
                itemId: chosen.itemId,
                audienceIds: [actor.id],
            },
        ])
        expect(inventory.containers.handle(other, command, now)[0]?.kind).toBe(
            'notice'
        )
        expect(inventory.containers.handle(actor, command, now)[0]?.kind).toBe(
            'notice'
        )
        expect(actor.inventory).toEqual([chosen])
        expect(other.inventory).toEqual([])
        expect(inventory.containers.snapshot(other, now)?.items).toEqual(
            items?.filter((item) => item.instanceId !== chosen.instanceId)
        )
        expect(inventory.snapshotItems()).toEqual([])
    })

    it('takes only what fits, preserves the remainder, and never duplicates on retries', () => {
        const { actor, inventory } = chestFixture()
        actor.inventory = Array.from({ length: INVENTORY_CAPACITY - 1 }, () =>
            createItemInstance('food')
        )
        inventory.openChestById(actor, chestId, now)
        const originals = inventory.containers.snapshot(actor, now)?.items ?? []
        const events = inventory.containers.handle(
            actor,
            { type: 'take_all_chest_items', chestId },
            now
        )
        expect(
            events.filter((event) => event.kind === 'item_pickup')
        ).toHaveLength(1)
        expect(events.at(-1)).toMatchObject({
            kind: 'notice',
            audienceIds: [actor.id],
        })
        expect(actor.inventory).toHaveLength(INVENTORY_CAPACITY)
        expect(actor.inventory.at(-1)).toEqual(originals[0])
        expect(inventory.containers.snapshot(actor, now)?.items).toEqual(
            originals.slice(1)
        )
        inventory.containers.handle(
            actor,
            { type: 'take_all_chest_items', chestId },
            now
        )
        expect(actor.inventory).toHaveLength(INVENTORY_CAPACITY)
        actor.inventory.splice(0, 2)
        inventory.containers.handle(
            actor,
            { type: 'take_all_chest_items', chestId },
            now
        )
        expect(inventory.containers.snapshot(actor, now)?.items).toEqual([])
        expect(
            inventory.containers.handle(
                actor,
                { type: 'take_all_chest_items', chestId },
                now
            )
        ).toEqual([])
        for (const original of originals) {
            expect(
                actor.inventory.filter(
                    (item) => item.instanceId === original.instanceId
                )
            ).toHaveLength(1)
        }
        expect(inventory.snapshotItems()).toEqual([])
    })
})

describe('chest session identity checks', () => {
    it('requires a matching open session and rejects phantom item IDs', () => {
        const { actor, inventory } = chestFixture()
        const command = { type: 'take_all_chest_items', chestId } as const
        expect(inventory.containers.handle(actor, command, now)[0]?.kind).toBe(
            'notice'
        )
        inventory.openChestById(actor, chestId, now)
        expect(
            inventory.containers.handle(
                actor,
                {
                    type: 'take_chest_item',
                    chestId,
                    itemInstanceId: 'food_forged',
                },
                now
            )[0]?.kind
        ).toBe('notice')
        expect(
            inventory.containers.handle(
                actor,
                { type: 'take_all_chest_items', chestId: 'missing' },
                now
            )[0]?.kind
        ).toBe('notice')
        expect(inventory.containers.snapshot(actor, now)).toBeNull()
        expect(actor.inventory).toEqual([])
        expect(inventory.snapshotChests()[0]?.itemCount).toBe(3)
    })
})

describe('chest transfer and legacy attack interaction', () => {
    it('spills only the remaining items and invalidates every viewer', () => {
        const { actor, inventory } = chestFixture()
        const other = chestHero('other')
        inventory.openChestById(actor, chestId, now)
        inventory.openChestById(other, chestId, now)
        const chosen = inventory.containers.snapshot(actor, now)?.items[0]
        if (chosen === undefined) {
            throw new Error('Expected chest item')
        }
        inventory.containers.handle(
            actor,
            {
                type: 'take_chest_item',
                chestId,
                itemInstanceId: chosen.instanceId,
            },
            now
        )
        actor.attackZones = [
            { ownerId: actor.id, minX: 96, maxX: 112, minY: 64, maxY: 80 },
        ]
        expect(inventory.openChestsHitBy(actor)).toEqual([
            { kind: 'chest_open', actorId: actor.id, chestId },
        ])
        expect(inventory.snapshotItems()).toHaveLength(2)
        expect(actor.inventory).toEqual([chosen])
        expect(inventory.containers.snapshot(actor, now)).toBeNull()
        expect(inventory.containers.snapshot(other, now)).toBeNull()
        expect(
            inventory.containers.handle(
                other,
                { type: 'take_all_chest_items', chestId },
                now
            )[0]?.kind
        ).toBe('notice')
        expect(inventory.openChestsHitBy(actor)).toEqual([])
        expect(inventory.snapshotItems()).toHaveLength(2)
        inventory.openChestById(other, chestId, now)
        expect(inventory.containers.snapshot(other, now)).toEqual({
            capacity: CHEST_CAPACITY,
            chestId,
            items: [],
        })
    })

    it('does not remove a selected item from a chest when the bag is full', () => {
        const { actor, inventory } = chestFixture()
        inventory.openChestById(actor, chestId, now)
        const before = inventory.containers.snapshot(actor, now)
        const chosen = before?.items[0]
        if (chosen === undefined) {
            throw new Error('Expected chest item')
        }
        actor.inventory = Array.from({ length: INVENTORY_CAPACITY }, () =>
            createItemInstance('food')
        )
        expect(
            inventory.containers.handle(
                actor,
                {
                    type: 'take_chest_item',
                    chestId,
                    itemInstanceId: chosen.instanceId,
                },
                now
            )[0]
        ).toMatchObject({ kind: 'notice', audienceIds: [actor.id] })
        expect(inventory.containers.snapshot(actor, now)).toEqual(before)
        expect(actor.inventory).toHaveLength(INVENTORY_CAPACITY)
        expect(inventory.snapshotItems()).toEqual([])
    })
})

describe('validated shared chest deposits', () => {
    it('updates all viewers without closing the lid or duplicating the deposited item', () => {
        const { actor, inventory } = chestFixture()
        const other = chestHero('other')
        inventory.openChestById(actor, chestId, now)
        inventory.openChestById(other, chestId, now)
        const food = createItemInstance('food')
        actor.inventory.push(food)
        const event = inventory.applyInventoryAction(
            actor,
            'stash',
            food.instanceId
        )[0]
        expect(event).toEqual({
            kind: 'item_stash',
            actorId: actor.id,
            audienceIds: [actor.id],
            chestId,
            itemId: 'food',
        })
        expect(actor.inventory).toEqual([])
        expect(inventory.snapshotChests()[0]).toMatchObject({
            state: 'open',
            itemCount: 4,
        })
        expect(inventory.containers.snapshot(other, now)?.items.at(-1)).toEqual(
            food
        )
        expect(
            inventory.applyInventoryAction(actor, 'stash', food.instanceId)[0]
                ?.kind
        ).toBe('notice')
        expect(inventory.containers.snapshot(actor, now)?.items).toHaveLength(4)
    })

    it('rejects a deposit through a wall before removing anything from the bag', () => {
        const { actor, inventory, navigation } = chestFixture()
        actor.position = { x: 72, y: 72 }
        navigation.grid.solid[4 * 20 + 5] = true
        const food = createItemInstance('food')
        actor.inventory.push(food)
        expect(
            inventory.applyInventoryAction(actor, 'stash', food.instanceId)[0]
                ?.kind
        ).toBe('notice')
        expect(actor.inventory).toEqual([food])
        expect(inventory.snapshotChests()[0]?.itemCount).toBe(3)
        expect(inventory.snapshotItems()).toEqual([])
    })
})

describe('container command input boundaries', () => {
    it.each([
        'open_chest',
        'take_chest_item',
        'take_all_chest_items',
        'close_chest',
    ])('validates and strips untrusted fields for %s', (type) => {
        const input = {
            type,
            chestId,
            itemInstanceId: 'real_instance',
            actorId: 'victim',
            items: ['fake'],
            count: 100,
        }
        const expected =
            type === 'take_chest_item'
                ? { type, chestId, itemInstanceId: 'real_instance' }
                : { type, chestId }
        expect(parseClientMessage(JSON.stringify(input)).message).toEqual(
            expected
        )
        expect(parseAgentDecision(input)).toEqual(expected)
        for (const invalidId of [null, 1, '', '   ', 'x'.repeat(101)]) {
            const invalid = { ...input, chestId: invalidId }
            expect(
                parseClientMessage(JSON.stringify(invalid)).message
            ).toBeUndefined()
            expect(parseAgentDecision(invalid)).toBeUndefined()
        }
    })

    it.each([undefined, null, 1, '', '  ', 'x'.repeat(101)])(
        'rejects invalid selected item ID %s',
        (itemInstanceId) => {
            const input = { type: 'take_chest_item', chestId, itemInstanceId }
            expect(
                parseClientMessage(JSON.stringify(input)).message
            ).toBeUndefined()
            expect(parseAgentDecision(input)).toBeUndefined()
        }
    )
})

describe('authoritative movement stop when opening', () => {
    it('clears input, path and dash on a valid open without moving the actor', () => {
        const { actor, inventory, navigation } = chestFixture()
        actor.setMoveInput({ x: 1, y: 0 })
        actor.path.push({ x: 160, y: 72 })
        actor.movement.mode = 'sneaking'
        actor.movement.dashStartedAt = now - 20
        actor.movement.dashUntil = now + 500
        actor.movement.dashDirection = { x: 1, y: 0 }
        const position = { ...actor.position }
        inventory.openChestById(actor, chestId, now)
        expect(actor.getMoveInput()).toEqual({ x: 0, y: 0 })
        expect(actor.path).toEqual([])
        expect(actor.movement.dashUntil).toBe(0)
        expect(actor.movement.mode).toBe('walking')
        advanceCharacter({
            character: actor,
            navigation,
            now: now + 50,
            deltaMs: 50,
        })
        expect(actor.position).toEqual(position)
    })

    it('preserves movement when opening is refused', () => {
        const { actor, inventory } = chestFixture()
        actor.position = { x: 8, y: 8 }
        actor.setMoveInput({ x: 1, y: 0 })
        actor.path.push({ x: 160, y: 72 })
        actor.movement.mode = 'sneaking'
        actor.movement.dashUntil = now + 500
        expect(inventory.openChestById(actor, chestId, now)[0]?.kind).toBe(
            'notice'
        )
        expect(actor.getMoveInput()).toEqual({ x: 1, y: 0 })
        expect(actor.path).toEqual([{ x: 160, y: 72 }])
        expect(actor.movement.mode).toBe('sneaking')
        expect(actor.movement.dashUntil).toBe(now + 500)
    })
})
