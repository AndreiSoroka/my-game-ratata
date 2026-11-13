import type { ChestClientMessage } from '@my-game-ratata/contracts'
import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { parseAgentDecision } from '../src/game/agentDecisions'
import type { GameCharacter } from '../src/game/character'
import { ChestContainers } from '../src/game/chestContainers'
import { createItemInstance, equipInventoryItem } from '../src/game/inventory'
import { parseClientMessage } from '../src/game/messages'
import type { NavigationService } from '../src/game/navigation'
import { GameRoom } from '../src/game/room'
import {
    chestFixture,
    chestHero,
    chestId,
    chestNavigation,
    now,
} from './chestTestHelpers'

afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

describe('targeted shared chest deposits', () => {
    it('moves a held instance once and updates concurrent viewers privately', () => {
        const { actor, inventory } = chestFixture()
        const other = chestHero('other')
        inventory.openChestById(actor, chestId, now)
        inventory.openChestById(other, chestId, now)
        const food = createItemInstance('food')
        actor.inventory.push(food)
        const message = {
            type: 'put_chest_item',
            chestId,
            itemInstanceId: food.instanceId,
        } as const
        expect(inventory.containers.handle(actor, message, now)).toEqual([
            {
                kind: 'item_stash',
                actorId: actor.id,
                chestId,
                itemId: food.itemId,
                audienceIds: [actor.id],
            },
        ])
        expect(actor.inventory).toEqual([])
        expect(inventory.containers.snapshot(other, now)?.items.at(-1)).toEqual(
            food
        )
        expect(inventory.containers.handle(actor, message, now)[0]?.kind).toBe(
            'notice'
        )
        expect(inventory.snapshotChests()[0]).toMatchObject({
            state: 'open',
            itemCount: 4,
        })
        inventory.containers.handle(
            other,
            {
                type: 'take_chest_item',
                chestId,
                itemInstanceId: food.instanceId,
            },
            now
        )
        expect(other.inventory).toEqual([food])
        expect(inventory.containers.handle(actor, message, now)[0]?.kind).toBe(
            'notice'
        )
        expect(inventory.containers.snapshot(actor, now)?.items).toHaveLength(3)
        expect(inventory.snapshotItems()).toEqual([])
    })

    it.each([false, true])(
        'requires an active view, previously opened=%s',
        (wasOpened) => {
            const { actor, inventory } = chestFixture()
            const food = createItemInstance('food')
            actor.inventory.push(food)
            if (wasOpened) {
                inventory.openChestById(actor, chestId, now)
                inventory.containers.handle(
                    actor,
                    { type: 'close_chest', chestId },
                    now
                )
            }
            expect(
                inventory.containers.handle(
                    actor,
                    {
                        type: 'put_chest_item',
                        chestId,
                        itemInstanceId: food.instanceId,
                    },
                    now
                )[0]?.kind
            ).toBe('notice')
            expect(actor.inventory).toEqual([food])
            expect(inventory.snapshotChests()[0]?.itemCount).toBe(3)
        }
    )
})

describe('targeted chest and item identity', () => {
    it('does not use a different nearby chest even with a valid view of another chest', () => {
        const navigation = chestNavigation()
        const actor = chestHero('hero')
        const first = {
            id: 'first',
            position: { x: 104, y: 72 },
            opened: false,
            contents: [],
        }
        const second = {
            id: 'second',
            position: { x: 104, y: 88 },
            opened: false,
            contents: [],
        }
        const containers = new ChestContainers(
            new Map([
                ['first', first],
                ['second', second],
            ]),
            navigation,
            CENTER_LOCATION_ID
        )
        const food = createItemInstance('food')
        actor.inventory.push(food)
        containers.handle(actor, { type: 'open_chest', chestId: first.id }, now)
        expect(
            containers.handle(
                actor,
                {
                    type: 'put_chest_item',
                    chestId: second.id,
                    itemInstanceId: food.instanceId,
                },
                now
            )[0]?.kind
        ).toBe('notice')
        expect(actor.inventory).toEqual([food])
        expect(first.contents).toEqual([])
        expect(second.contents).toEqual([])
        expect(containers.snapshot(actor, now)?.chestId).toBe(first.id)
    })

    it.each(['unknown', 'equipped', 'foreign'] as const)(
        'rejects %s item IDs without losing the real bag item',
        (kind) => {
            const { actor, inventory } = chestFixture()
            inventory.openChestById(actor, chestId, now)
            const held = createItemInstance('food')
            const weapon = createItemInstance('simple_sword')
            const foreign = createItemInstance('boots')
            const other = chestHero('other')
            actor.inventory.push(held, weapon)
            equipInventoryItem(
                actor.inventory,
                actor.equipment,
                weapon.instanceId
            )
            other.inventory.push(foreign)
            const itemInstanceId =
                kind === 'unknown'
                    ? 'missing'
                    : kind === 'equipped'
                      ? weapon.instanceId
                      : foreign.instanceId
            expect(
                inventory.containers.handle(
                    actor,
                    { type: 'put_chest_item', chestId, itemInstanceId },
                    now
                )[0]?.kind
            ).toBe('notice')
            expect(actor.inventory).toEqual([held])
            expect(actor.equipment.weapon).toEqual(weapon)
            expect(other.inventory).toEqual([foreign])
            expect(inventory.snapshotChests()[0]?.itemCount).toBe(3)
        }
    )
})

const unavailable = [
    'dead',
    'offline',
    'retired',
    'stunned',
    'locked',
    'range',
    'location',
    'wall',
] as const

describe('put revalidates access before removing the item', () => {
    it.each(unavailable)('retains the bag item when %s', (state) => {
        const { actor, inventory, navigation } = chestFixture()
        inventory.openChestById(actor, chestId, now)
        const food = createItemInstance('food')
        actor.inventory.push(food)
        invalidate(state, actor, navigation)
        expect(
            inventory.containers.handle(
                actor,
                {
                    type: 'put_chest_item',
                    chestId,
                    itemInstanceId: food.instanceId,
                },
                now
            )[0]
        ).toMatchObject({ kind: 'notice', audienceIds: [actor.id] })
        expect(actor.inventory).toEqual([food])
        expect(inventory.snapshotChests()[0]?.itemCount).toBe(3)
        expect(inventory.containers.snapshot(actor, now)).toBeNull()
        expect(inventory.snapshotItems()).toEqual([])
    })
})

describe('put command boundaries and shared agent controller', () => {
    it('parses only target chest and held instance IDs for both actor sources', () => {
        const input = {
            type: 'put_chest_item',
            chestId,
            itemInstanceId: 'held_item',
            actorId: 'victim',
            itemId: 'boots',
            count: 99,
        }
        const expected: ChestClientMessage = {
            type: 'put_chest_item',
            chestId,
            itemInstanceId: 'held_item',
        }
        expect(parseClientMessage(JSON.stringify(input)).message).toEqual(
            expected
        )
        expect(parseAgentDecision(input)).toEqual(expected)
        for (const badChestId of [null, 1, '', '  ', 'x'.repeat(101)]) {
            const invalid = { ...input, chestId: badChestId }
            expect(
                parseClientMessage(JSON.stringify(invalid)).message
            ).toBeUndefined()
            expect(parseAgentDecision(invalid)).toBeUndefined()
        }
    })

    it.each([undefined, null, 1, '', ' ', 'x'.repeat(101)])(
        'rejects malformed held instance ID %s',
        (itemInstanceId) => {
            const input = { type: 'put_chest_item', chestId, itemInstanceId }
            expect(
                parseClientMessage(JSON.stringify(input)).message
            ).toBeUndefined()
            expect(parseAgentDecision(input)).toBeUndefined()
        }
    )

    it('uses the same shared transfer for NPC agent and refreshes only its private view', () => {
        vi.stubGlobal('Bun', { env: {} })
        vi.spyOn(Math, 'random').mockReturnValue(0)
        const room = new GameRoom(chestNavigation('chest-put-test'))
        const npc = room.getCharacter('npc_veteran_1')
        if (npc === undefined) {
            throw new Error('Expected veteran')
        }
        npc.position = { x: 88, y: 72 }
        const food = createItemInstance('food')
        npc.inventory.push(food)
        const message = {
            type: 'put_chest_item',
            chestId,
            itemInstanceId: food.instanceId,
        }
        expect(room.decideForAgent(npc.id, message).events[0]?.kind).toBe(
            'notice'
        )
        expect(npc.inventory).toContainEqual(food)
        room.decideForAgent(npc.id, { type: 'open_chest', chestId })
        const result = room.decideForAgent(npc.id, message)
        expect(result.accepted).toBe(true)
        expect(result.chest?.items.at(-1)).toEqual(food)
        expect(result.events[0]).toMatchObject({
            kind: 'item_stash',
            audienceIds: [npc.id],
        })
        expect(
            npc.inventory.some((item) => item.instanceId === food.instanceId)
        ).toBe(false)
        expect(room.decideForAgent(npc.id, message).events[0]?.kind).toBe(
            'notice'
        )
        expect(room.snapshot(now).chest).toBeUndefined()
        room.stop()
    })
})

function invalidate(
    state: (typeof unavailable)[number],
    actor: GameCharacter,
    navigation: NavigationService
) {
    switch (state) {
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
        case 'range':
            actor.position = { x: 8, y: 8 }
            break
        case 'location':
            actor.locationId = 'map-1-2'
            break
        case 'wall':
            actor.position = { x: 72, y: 72 }
            navigation.grid.solid[4 * 20 + 5] = true
            break
    }
}
