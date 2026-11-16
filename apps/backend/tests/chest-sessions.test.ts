import type { ChestClientMessage } from '@my-game-ratata/contracts'
import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { GameCharacter } from '../src/game/character'
import type { NavigationService } from '../src/game/navigation'
import { GameRoom } from '../src/game/room'
import { WorldLocations } from '../src/game/worldLocations'
import {
    chestFixture,
    chestHero,
    chestId,
    chestNavigation,
    joinChestRoom,
    now,
} from './chestTestHelpers'

afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

const invalidStates = [
    'dead',
    'offline',
    'retired',
    'stunned',
    'locked',
    'range',
    'location',
    'wall',
] as const
const takeTypes = ['take_chest_item', 'take_all_chest_items'] as const

describe.each(takeTypes)('session authority for %s', (type) => {
    it.each(invalidStates)('revalidates %s before moving any item', (state) => {
        const { actor, inventory, navigation } = chestFixture()
        inventory.openChestById(actor, chestId, now)
        const item = inventory.containers.snapshot(actor, now)?.items[0]
        if (item === undefined) {
            throw new Error('Expected chest item')
        }
        invalidate(state, actor, navigation)
        const message: ChestClientMessage =
            type === 'take_chest_item'
                ? { type, chestId, itemInstanceId: item.instanceId }
                : { type, chestId }
        expect(
            inventory.containers.handle(actor, message, now)[0]
        ).toMatchObject({ kind: 'notice', audienceIds: [actor.id] })
        expect(actor.inventory).toEqual([])
        expect(inventory.snapshotChests()[0]?.itemCount).toBe(3)
        restore(actor, navigation)
        expect(inventory.containers.snapshot(actor, now)).toBeNull()
        expect(inventory.snapshotItems()).toEqual([])
    })
})

describe('idle chest view lifecycle', () => {
    it.each(invalidStates)(
        'revokes an idle %s viewer before returning to normal',
        (state) => {
            const { actor, inventory, navigation } = chestFixture()
            inventory.openChestById(actor, chestId, now)
            invalidate(state, actor, navigation)
            inventory.containers.update(new Map([[actor.id, actor]]), now)
            restore(actor, navigation)
            expect(inventory.containers.snapshot(actor, now)).toBeNull()
        }
    )

    it('closes a window without closing the lid and never mutates items through snapshot copies', () => {
        const { actor, inventory } = chestFixture()
        inventory.openChestById(actor, chestId, now)
        const view = inventory.containers.snapshot(actor, now)
        if (view === null) {
            throw new Error('Expected private view')
        }
        view.items.splice(0)
        expect(inventory.containers.snapshot(actor, now)?.items).toHaveLength(3)
        inventory.containers.handle(
            actor,
            { type: 'close_chest', chestId },
            now
        )
        expect(inventory.containers.snapshot(actor, now)).toBeNull()
        expect(inventory.snapshotChests()[0]).toMatchObject({
            state: 'open',
            itemCount: 3,
        })
        inventory.openChestById(actor, chestId, now)
        expect(inventory.containers.snapshot(actor, now)?.items).toHaveLength(3)
        inventory.containers.update(new Map(), now)
        expect(inventory.containers.snapshot(actor, now)).toBeNull()
    })

    it('revokes on travel even when the actor returns to the original chest', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0)
        const world = new WorldLocations(chestNavigation('chest-travel-test'))
        const actor = chestHero('traveler')
        const inventory = world.get().inventory
        inventory.openChestById(actor, chestId, now)
        actor.position = { x: 8, y: 72 }
        world.travel(actor, { x: -1, y: 0 })
        expect(actor.locationId).toBe('map-1-2')
        actor.position = { x: 312, y: 72 }
        world.travel(actor, { x: 1, y: 0 })
        expect(actor.locationId).toBe(CENTER_LOCATION_ID)
        actor.position = { x: 88, y: 72 }
        expect(inventory.containers.snapshot(actor, now)).toBeNull()
        expect(
            inventory.containers.handle(
                actor,
                { type: 'take_all_chest_items', chestId },
                now
            )[0]?.kind
        ).toBe('notice')
    })
})

describe('socket chest view privacy and lifetime', () => {
    it('shows contents only to open viewers and sends transfer details only to the taker', () => {
        const room = createRoom()
        const first = joinChestRoom(room, 'First')
        const second = joinChestRoom(room, 'Second')
        room.handleMessage(
            first.socket,
            JSON.stringify({ type: 'open_chest', chestId })
        )
        const firstView = room.snapshot(now, CENTER_LOCATION_ID, first.actor.id)
        const chosen = firstView.chest?.items[0]
        if (chosen === undefined) {
            throw new Error('Expected chest item')
        }
        expect(room.snapshot(now).chest).toBeUndefined()
        expect(
            room.snapshot(now, CENTER_LOCATION_ID, second.actor.id).chest
        ).toBeNull()
        room.handleMessage(
            second.socket,
            JSON.stringify({ type: 'open_chest', chestId })
        )
        first.sent.splice(0)
        second.sent.splice(0)
        room.handleMessage(
            first.socket,
            JSON.stringify({
                type: 'take_chest_item',
                chestId,
                itemInstanceId: chosen.instanceId,
            })
        )
        expect(
            first.sent.some(
                (message) =>
                    message.type === 'event' &&
                    message.event.kind === 'item_pickup'
            )
        ).toBe(true)
        expect(
            second.sent.some(
                (message) =>
                    message.type === 'event' &&
                    message.event.kind === 'item_pickup'
            )
        ).toBe(false)
        const secondView = room.snapshot(
            now,
            CENTER_LOCATION_ID,
            second.actor.id
        )
        expect(secondView.chest?.items).toHaveLength(2)
        expect(
            secondView.chest?.items.some(
                (item) => item.instanceId === chosen.instanceId
            )
        ).toBe(false)
        expect(
            secondView.characters.find(
                (character) => character.id === first.actor.id
            )?.inventory
        ).toEqual([])
        room.stop()
    })

    it('closes the same identity view on disconnect and does not restore it on reconnect', () => {
        const room = createRoom()
        const first = joinChestRoom(room, 'Returning')
        room.handleMessage(
            first.socket,
            JSON.stringify({ type: 'open_chest', chestId })
        )
        expect(
            room.snapshot(now, CENTER_LOCATION_ID, first.actor.id).chest?.items
        ).toHaveLength(3)
        room.handleClose(first.socket)
        const rejoined = joinChestRoom(room, 'Returning')
        expect(rejoined.actor.id).toBe(first.actor.id)
        expect(
            room.snapshot(now, CENTER_LOCATION_ID, rejoined.actor.id).chest
        ).toBeNull()
        room.handleMessage(
            rejoined.socket,
            JSON.stringify({ type: 'take_all_chest_items', chestId })
        )
        expect(rejoined.actor.inventory).toEqual([])
        room.stop()
    })
})

describe('NPC chest controller privacy', () => {
    it('returns only the authorized NPC view for selective agent takes', () => {
        const room = createRoom()
        const npc = room.getCharacter('npc_veteran_1')
        if (npc === undefined) {
            throw new Error('Expected veteran NPC')
        }
        npc.position = { x: 88, y: 72 }
        const opened = room.decideForAgent(npc.id, {
            type: 'open_chest',
            chestId,
        })
        const item = opened.chest?.items[1]
        if (item === undefined) {
            throw new Error('Expected private NPC item view')
        }
        const taken = room.decideForAgent(npc.id, {
            type: 'take_chest_item',
            chestId,
            itemInstanceId: item.instanceId,
        })
        expect(taken.chest?.items).toHaveLength(2)
        expect(npc.inventory).toContainEqual(item)
        expect(room.snapshot(now).chest).toBeUndefined()
        const replay = room.decideForAgent(npc.id, {
            type: 'take_chest_item',
            chestId,
            itemInstanceId: item.instanceId,
        })
        expect(replay.events[0]?.kind).toBe('notice')
        expect(
            npc.inventory.filter(
                (candidate) => candidate.instanceId === item.instanceId
            )
        ).toHaveLength(1)
        expect(
            room.decideForAgent(npc.id, { type: 'close_chest', chestId }).chest
        ).toBeNull()
        room.stop()
    })
})

function createRoom() {
    vi.stubGlobal('Bun', { env: {} })
    vi.spyOn(Math, 'random').mockReturnValue(0)
    return new GameRoom(chestNavigation('chest-room-test'))
}

function invalidate(
    state: (typeof invalidStates)[number],
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

function restore(actor: GameCharacter, navigation: NavigationService) {
    actor.alive = true
    actor.tags.clear()
    actor.stunUntil = 0
    actor.actionLockUntil = 0
    actor.locationId = CENTER_LOCATION_ID
    actor.position = { x: 88, y: 72 }
    navigation.grid.solid.fill(false)
}

describe('socket identity rebinding', () => {
    it('revokes the old identity view on A to B to A joins on one connection', () => {
        const room = createRoom()
        const first = joinChestRoom(room, 'Identity A')
        room.handleMessage(
            first.socket,
            JSON.stringify({ type: 'open_chest', chestId })
        )
        expect(
            room.snapshot(now, CENTER_LOCATION_ID, first.actor.id).chest?.items
        ).toHaveLength(3)
        room.handleMessage(
            first.socket,
            JSON.stringify({ type: 'join', nickname: 'Identity B' })
        )
        room.handleMessage(
            first.socket,
            JSON.stringify({ type: 'join', nickname: 'Identity A' })
        )
        const inits = first.sent.filter(
            (message) => message.type === 'world_init'
        )
        expect(inits.at(-1)?.playerId).toBe(first.actor.id)
        expect(
            room.snapshot(now, CENTER_LOCATION_ID, first.actor.id).chest
        ).toBeNull()
        room.handleMessage(
            first.socket,
            JSON.stringify({ type: 'take_all_chest_items', chestId })
        )
        expect(first.actor.inventory).toEqual([])
        room.stop()
    })
})
