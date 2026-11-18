import { afterEach, describe, expect, it, vi } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { createCharacterSnapshot } from '../src/game/characterSnapshot'
import { createItemInstance } from '../src/game/inventory'
import { NavigationService } from '../src/game/navigation'
import { WorldInventory } from '../src/game/worldInventory'

const chestPosition = { x: 104, y: 72 }

afterEach(() => {
    vi.restoreAllMocks()
})

describe('world inventory chests', () => {
    it('keeps unopened empty chests closed until they are hit', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.99)
        const world = new WorldInventory(fakeNavigation)
        const player = createPlayerAt(chestPosition)

        expect(world.snapshotChests()).toEqual([
            expect.objectContaining({
                itemCount: 0,
                state: 'closed',
            }),
        ])

        player.attackZones = [attackZoneAround(chestPosition, player.id)]

        expect(world.openChestsHitBy(player)).toEqual([
            {
                actorId: player.id,
                chestId: 'chest_forest_1',
                kind: 'chest_open',
            },
        ])
        expect(world.snapshotChests()).toEqual([
            expect.objectContaining({
                itemCount: 0,
                state: 'open',
            }),
        ])
        expect(world.snapshotItems()).toEqual([])
    })

    it('drops generated chest contents once and equips picked up weapons', () => {
        vi.spyOn(Math, 'random')
            .mockReturnValueOnce(0)
            .mockReturnValueOnce(0)
            .mockReturnValueOnce(0)
        const world = new WorldInventory(fakeNavigation)
        const player = createPlayerAt(chestPosition)
        player.attackZones = [attackZoneAround(chestPosition, player.id)]

        expect(world.openChestsHitBy(player)).toEqual([
            {
                actorId: player.id,
                chestId: 'chest_forest_1',
                kind: 'chest_open',
            },
        ])
        expect(world.snapshotChests()).toEqual([
            expect.objectContaining({
                itemCount: 0,
                state: 'open',
            }),
        ])
        expect(world.snapshotItems().map((item) => item.itemId)).toEqual([
            'simple_sword',
            'food',
            'boots',
        ])
        expect(world.openChestsHitBy(player)).toEqual([])

        for (const item of world.snapshotItems()) {
            player.position = item.position
            expect(world.pickupNearestItem(player)).toEqual([
                expect.objectContaining({
                    itemId: item.itemId,
                    kind: 'item_pickup',
                }),
            ])
        }

        const sword = player.inventory.find(
            (item) => item.itemId === 'simple_sword'
        )

        if (sword === undefined) {
            throw new Error('simple sword was not picked up')
        }

        expect(world.snapshotItems()).toEqual([])
        expect(
            world.applyInventoryAction(player, 'equip', sword.instanceId)
        ).toEqual([
            {
                actorId: player.id,
                itemId: 'simple_sword',
                kind: 'item_equip',
            },
        ])
        expect(player.equipment.weapon?.itemId).toBe('simple_sword')
        expect(createCharacterSnapshot(player, 0).stats).toMatchObject({
            maxDamage: 12,
            minDamage: 8,
        })
    })
})

describe('world inventory stashing', () => {
    it('stores a real item in a closed chest until the chest is hit', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.99)
        const world = new WorldInventory(fakeNavigation)
        const player = createPlayerAt(chestPosition)
        const food = createItemInstance('food')
        player.inventory.push(food)

        expect(
            world.applyInventoryAction(player, 'stash', food.instanceId)
        ).toEqual([
            {
                actorId: player.id,
                chestId: 'chest_forest_1',
                itemId: 'food',
                kind: 'item_stash',
                audienceIds: [player.id],
            },
        ])
        expect(world.snapshotChests()).toEqual([
            expect.objectContaining({
                itemCount: 1,
                state: 'closed',
            }),
        ])

        player.attackZones = [attackZoneAround(chestPosition, player.id)]
        world.openChestsHitBy(player)

        expect(world.snapshotChests()).toEqual([
            expect.objectContaining({
                itemCount: 0,
                state: 'open',
            }),
        ])
        expect(world.snapshotItems()).toEqual([
            expect.objectContaining({
                itemId: 'food',
            }),
        ])
    })
})

function createPlayerAt(position: { x: number; y: number }): GameCharacter {
    return new GameCharacter({
        archetype: 'human',
        controllerKind: 'network_player',
        id: 'player',
        nickname: 'Player',
        spawnPosition: position,
    })
}

function attackZoneAround(position: { x: number; y: number }, ownerId: string) {
    return {
        maxX: position.x + 8,
        maxY: position.y + 8,
        minX: position.x - 8,
        minY: position.y - 8,
        ownerId,
    }
}

const fakeNavigation = new NavigationService({
    width: 15,
    height: 10,
    id: 'map-2-2',
    solid: Array<boolean>(150).fill(false),
    solidLayerNames: [],
    tileWidth: 16,
    tileHeight: 16,
})
