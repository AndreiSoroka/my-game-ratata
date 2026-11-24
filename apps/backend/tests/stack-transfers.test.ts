import { CHEST_CAPACITY } from '@my-game-ratata/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ChestContainers } from '../src/game/chestContainers'
import type { WorldChest } from '../src/game/chestInteraction'
import {
    countInventoryItem,
    createItemInstance,
    type InventoryItemInstance,
    itemQuantity,
} from '../src/game/inventory'
import {
    chestFixture,
    chestHero,
    chestId,
    chestNavigation,
    chestPosition,
    now,
} from './chestTestHelpers'
import { required } from './containerTestHelpers'
import { theftFixture } from './theftFixtures'

afterEach(() => {
    vi.restoreAllMocks()
})

function bagWithHerbs(quantity: number): InventoryItemInstance[] {
    return [
        ...Array.from({ length: 49 }, () => createItemInstance('wood')),
        createItemInstance('herbs', quantity),
    ]
}
function stackChest(contents: InventoryItemInstance[]) {
    const navigation = chestNavigation()
    const chest: WorldChest = {
        id: chestId,
        opened: false,
        contents,
        position: chestPosition,
    }
    const containers = new ChestContainers(
        new Map([[chestId, chest]]),
        navigation,
        navigation.grid.id
    )
    const actor = chestHero('first')
    const other = chestHero('second')
    containers.handle(actor, { type: 'open_chest', chestId }, now)
    containers.handle(other, { type: 'open_chest', chestId }, now)
    return { actor, other, containers, chest }
}

describe('whole stack container transfers', () => {
    it('lets only the first viewer merge a selected stack and publishes its quantity privately', () => {
        const herbs = createItemInstance('herbs', 3)
        const { actor, other, containers, chest } = stackChest([herbs])
        actor.inventory = bagWithHerbs(6)
        other.inventory = bagWithHerbs(6)
        expect(containers.snapshot(actor, now)?.items[0]?.quantity).toBe(3)
        const command = {
            type: 'take_chest_item',
            chestId,
            itemInstanceId: herbs.instanceId,
        } as const
        expect(containers.handle(actor, command, now)[0]).toMatchObject({
            kind: 'item_pickup',
            audienceIds: [actor.id],
        })
        expect(containers.handle(other, command, now)[0]?.kind).toBe('notice')
        expect(containers.handle(actor, command, now)[0]?.kind).toBe('notice')
        expect(countInventoryItem(actor.inventory, 'herbs')).toBe(9)
        expect(countInventoryItem(other.inventory, 'herbs')).toBe(6)
        expect(chest.contents).toEqual([])
        expect(actor.inventory).toHaveLength(50)
    })

    it('bulk take skips an item needing a slot and still merges a later stack', () => {
        const wood = createItemInstance('wood')
        const herbs = createItemInstance('herbs')
        const { actor, containers, chest } = stackChest([wood, herbs])
        actor.inventory = bagWithHerbs(8)
        const events = containers.handle(
            actor,
            { type: 'take_all_chest_items', chestId },
            now
        )
        expect(
            events.filter((event) => event.kind === 'item_pickup')
        ).toHaveLength(1)
        expect(countInventoryItem(actor.inventory, 'herbs')).toBe(9)
        expect(chest.contents).toEqual([wood])
        containers.handle(actor, { type: 'take_all_chest_items', chestId }, now)
        expect(chest.contents).toEqual([wood])
        expect(actor.inventory).toHaveLength(50)
    })

    it('does not partially drain a chest stack when the bag cannot receive it whole', () => {
        const herbs = createItemInstance('herbs', 2)
        const { actor, containers, chest } = stackChest([herbs])
        actor.inventory = bagWithHerbs(8)
        const before = structuredClone(actor.inventory)
        containers.handle(
            actor,
            {
                type: 'take_chest_item',
                chestId,
                itemInstanceId: herbs.instanceId,
            },
            now
        )
        expect(actor.inventory).toEqual(before)
        expect(chest.contents).toEqual([herbs])
    })
})

describe('capacity-aware stack deposits', () => {
    it('rejects a non-fitting whole deposit atomically but accepts a fitting portion', () => {
        const herbs = createItemInstance('herbs', 7)
        const { actor, containers, chest } = stackChest([
            herbs,
            ...Array.from({ length: CHEST_CAPACITY - 1 }, () =>
                createItemInstance('wood')
            ),
        ])
        const deposited = createItemInstance('herbs', 3)
        actor.inventory = [deposited]
        const put = {
            type: 'put_chest_item',
            chestId,
            itemInstanceId: deposited.instanceId,
        } as const
        const before = structuredClone(chest.contents)
        for (const command of [put, { ...put, quantity: 3 }]) {
            expect(containers.handle(actor, command, now)[0]).toMatchObject({
                kind: 'notice',
                text: 'В сундуке нет места.',
                audienceIds: [actor.id],
            })
            expect(chest.contents).toEqual(before)
            expect(actor.inventory).toEqual([deposited])
            expect(itemQuantity(deposited)).toBe(3)
        }
        expect(
            containers.handle(actor, { ...put, quantity: 4 }, now)[0]?.text
        ).toBe('Предмета больше нет в сумке.')
        expect(
            containers.handle(actor, { ...put, quantity: 2 }, now)[0]?.kind
        ).toBe('item_stash')
        expect(chest.contents).toHaveLength(CHEST_CAPACITY)
        expect(chest.contents[0]).toMatchObject({
            instanceId: herbs.instanceId,
            quantity: 9,
        })
        expect(actor.inventory).toEqual([
            { itemId: 'herbs', instanceId: deposited.instanceId },
        ])
    })

    it('allows taking from a legacy overfilled chest and merging at its capacity', () => {
        const herbs = createItemInstance('herbs', 8)
        const { actor, containers, chest } = stackChest([
            herbs,
            ...Array.from({ length: CHEST_CAPACITY }, () =>
                createItemInstance('wood')
            ),
        ])
        const deposited = createItemInstance('herbs')
        actor.inventory = [deposited]
        const put = {
            type: 'put_chest_item',
            chestId,
            itemInstanceId: deposited.instanceId,
        } as const
        expect(containers.handle(actor, put, now)[0]?.text).toBe(
            'В сундуке нет места.'
        )
        expect(chest.contents).toHaveLength(CHEST_CAPACITY + 1)
        expect(chest.contents[0]).toEqual(herbs)
        expect(actor.inventory).toEqual([deposited])

        const wood = required(chest.contents.at(-1))
        expect(
            containers.handle(
                actor,
                {
                    type: 'take_chest_item',
                    chestId,
                    itemInstanceId: wood.instanceId,
                },
                now
            )[0]?.kind
        ).toBe('item_pickup')
        expect(containers.handle(actor, put, now)[0]?.kind).toBe('item_stash')
        expect(chest.contents).toHaveLength(CHEST_CAPACITY)
        expect(chest.contents[0]).toMatchObject({
            instanceId: herbs.instanceId,
            quantity: 9,
        })
        expect(actor.inventory).toEqual([wood])
    })
})

describe('whole stack drops and pickups', () => {
    it('preserves ground quantity and retries safely when only part fits, then transfers once', () => {
        const { actor, inventory } = chestFixture()
        const stack = createItemInstance('herbs', 3)
        actor.inventory = [stack]
        inventory.applyInventoryAction(actor, 'drop', stack.instanceId)
        inventory.applyInventoryAction(actor, 'drop', stack.instanceId)
        const ground = inventory.snapshotItems()[0]
        if (ground === undefined) {
            throw new Error('Missing dropped herbs')
        }
        expect(inventory.snapshotItems()).toHaveLength(1)
        expect(ground.quantity).toBe(3)
        actor.position = ground.position
        actor.inventory = bagWithHerbs(8)
        const before = structuredClone(actor.inventory)
        expect(inventory.pickupItem(actor, ground.id, now)).toEqual([])
        expect(actor.inventory).toEqual(before)
        expect(inventory.snapshotItems()[0]?.quantity).toBe(3)
        actor.inventory.shift()
        expect(inventory.pickupItem(actor, ground.id, now)[0]?.kind).toBe(
            'item_pickup'
        )
        expect(countInventoryItem(actor.inventory, 'herbs')).toBe(11)
        expect(
            actor.inventory
                .filter((item) => item.itemId === 'herbs')
                .map(itemQuantity)
        ).toEqual([9, 2])
        expect(inventory.snapshotItems()).toEqual([])
        expect(inventory.pickupItem(actor, ground.id, now)).toEqual([])
        expect(countInventoryItem(actor.inventory, 'herbs')).toBe(11)
    })
})

describe('whole stack theft', () => {
    it('merges one real victim stack into a full thief bag and does not transfer twice', () => {
        const { actor, victim, attempt } = theftFixture()
        actor.inventory = bagWithHerbs(6)
        victim.inventory = [createItemInstance('herbs', 3)]
        const energy = actor.energy
        attempt()
        expect(victim.inventory).toEqual([])
        expect(countInventoryItem(actor.inventory, 'herbs')).toBe(9)
        expect(actor.inventory).toHaveLength(50)
        expect(actor.energy).toBe(energy - 10)
        attempt()
        expect(countInventoryItem(actor.inventory, 'herbs')).toBe(9)
        expect(actor.energy).toBe(energy - 10)
    })

    it('rejects a non-fitting whole stack before RNG, energy, cooldown or practice', () => {
        const { actor, victim, navigation, service } = theftFixture()
        actor.inventory = bagWithHerbs(8)
        victim.inventory = [createItemInstance('herbs', 3)]
        const before = structuredClone({
            actor: actor.inventory,
            victim: victim.inventory,
            progression: actor.progression,
        })
        const energy = actor.energy
        const random = vi.fn(() => 0)
        service.handle(
            actor,
            { type: 'steal', targetId: victim.id },
            { characters: [actor, victim], navigation, now, random }
        )
        expect(random).not.toHaveBeenCalled()
        expect({
            actor: actor.inventory,
            victim: victim.inventory,
            progression: actor.progression,
        }).toEqual(before)
        expect(actor.energy).toBe(energy)
        expect(service.snapshot(actor.id, actor.id, now).cooldownMsLeft).toBe(0)
    })
})
