import {
    type AuthoredContainerDefinition,
    CHEST_CAPACITY,
    INVENTORY_CAPACITY,
} from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { AdventureService } from '../src/game/adventure'
import { GameCharacter } from '../src/game/character'
import { executeContainerCommand } from '../src/game/containerCommands'
import { createItemInstance } from '../src/game/inventory'
import { NavigationService } from '../src/game/navigation'
import { WorldInventory } from '../src/game/worldInventory'
import { required } from './containerTestHelpers'

const definition: AuthoredContainerDefinition = {
    id: 'map-2-2:barrel:10:10',
    kind: 'barrel',
    title: 'Бочка общих припасов',
    propId: 'map-2-2:prop:10:10',
    bounds: { x: 160, y: 160, width: 16, height: 16 },
    contents: [
        { itemId: 'wood', quantity: 1 },
        { itemId: 'fiber', quantity: 1 },
    ],
}
function fixture() {
    const navigation = new NavigationService({
        id: 'map-2-2',
        width: 32,
        height: 32,
        tileWidth: 16,
        tileHeight: 16,
        solidLayerNames: [],
        solid: Array<boolean>(1024).fill(false),
        containers: [definition],
    })
    navigation.grid.solid[10 * 32 + 10] = true
    const inventory = new WorldInventory(navigation)
    const actor = new GameCharacter({
        id: 'first',
        nickname: 'First',
        archetype: 'human',
        controllerKind: 'network_player',
        spawnPosition: { x: 168, y: 192 },
    })
    const other = new GameCharacter({
        id: 'second',
        nickname: 'Second',
        archetype: 'human',
        controllerKind: 'scripted',
        spawnPosition: actor.position,
    })
    actor.inventory = []
    other.inventory = []
    const service = new AdventureService({
        resourceNodes: [],
        worldObjects: [
            {
                id: definition.id,
                kind: 'barrel',
                name: definition.title,
                text: '',
                locationId: actor.locationId,
                bounds: definition.bounds,
            },
        ],
        openContainer: (who, id, now) =>
            executeContainerCommand(
                inventory.containers,
                who,
                { type: 'open_chest', chestId: id },
                now
            ),
    })
    const command = (who = actor) =>
        executeContainerCommand(
            inventory.containers,
            who,
            { type: 'open_chest', chestId: definition.id },
            1000
        )
    return { navigation, inventory, actor, other, service, command }
}
describe('barrel capacity', () => {
    it('accepts deposits beyond the ordinary chest limit', () => {
        const f = fixture()
        expect(f.command().chest).not.toHaveProperty('capacity')
        const items = Array.from({ length: CHEST_CAPACITY }, () =>
            createItemInstance('food')
        )
        f.actor.inventory = items.slice()
        for (const item of items) {
            expect(
                f.inventory.containers.handle(
                    f.actor,
                    {
                        type: 'put_chest_item',
                        chestId: definition.id,
                        itemInstanceId: item.instanceId,
                    },
                    1000
                )[0]?.kind
            ).toBe('item_stash')
        }
        expect(f.actor.inventory).toEqual([])
        expect(
            f.inventory.containers.snapshot(f.actor, 1000)?.items
        ).toHaveLength(CHEST_CAPACITY + 2)
    })
})

describe('barrels share the authoritative chest inventory', () => {
    it('opens privately even with a full bag; compatibility interaction creates no rewards or duplicate target', () => {
        const f = fixture()
        f.actor.inventory = Array.from({ length: INVENTORY_CAPACITY }, () =>
            createItemInstance('food')
        )
        const before = structuredClone(f.actor.inventory)
        const message = {
            type: 'world_interact',
            objectId: definition.id,
        } as const
        expect(
            f.service.handleResult(f.actor, message, [], f.navigation, 1000)
                .accepted
        ).toBe(true)
        expect(f.inventory.containers.snapshot(f.actor, 1000)).toMatchObject({
            kind: 'barrel',
            title: definition.title,
            items: [{ itemId: 'wood' }, { itemId: 'fiber' }],
        })
        expect(f.inventory.containers.snapshot(f.other, 1000)).toBeNull()
        expect(f.actor.inventory).toEqual(before)
        expect(
            f.service.snapshot(f.actor.id, f.actor.locationId, f.actor)
                .worldObjects
        ).toEqual([])
        expect(
            f.service.handleResult(f.actor, message, [], f.navigation, 1000)
                .accepted
        ).toBe(true)
        expect(
            f.inventory
                .snapshotChests()
                .find((chest) => chest.id === definition.id)
        ).toMatchObject({
            kind: 'barrel',
            propId: definition.propId,
            bounds: definition.bounds,
            itemCount: 2,
        })
    })
    it('takes a partial remainder, allows storing back and never duplicates an instance across viewers or retries', () => {
        const f = fixture()
        const view = required(f.command().chest)
        f.command(f.other)
        f.actor.inventory = Array.from({ length: INVENTORY_CAPACITY - 1 }, () =>
            createItemInstance('food')
        )
        const all = {
            type: 'take_all_chest_items',
            chestId: definition.id,
        } as const
        expect(
            executeContainerCommand(f.inventory.containers, f.actor, all, 1000)
                .accepted
        ).toBe(true)
        expect(
            f.inventory.containers
                .snapshot(f.other, 1000)
                ?.items.map((item) => item.itemId)
        ).toEqual(['fiber'])
        const wood = required(view.items[0])
        const take = {
            type: 'take_chest_item',
            chestId: definition.id,
            itemInstanceId: wood.instanceId,
        } as const
        expect(
            executeContainerCommand(f.inventory.containers, f.other, take, 1000)
                .accepted
        ).toBe(false)
        expect(
            executeContainerCommand(
                f.inventory.containers,
                f.actor,
                { ...take, type: 'put_chest_item' },
                1000
            ).accepted
        ).toBe(true)
        expect(
            executeContainerCommand(f.inventory.containers, f.other, take, 1000)
                .accepted
        ).toBe(true)
        expect(
            executeContainerCommand(f.inventory.containers, f.other, take, 1000)
                .accepted
        ).toBe(false)
        expect(f.other.inventory).toEqual([wood])
        expect(f.command().chest?.items.map((item) => item.itemId)).toEqual([
            'fiber',
        ])
    })
    it('spills only real leftovers on a hit, closes all viewers and does not refill on reopening', () => {
        const f = fixture()
        const view = required(f.command().chest)
        f.command(f.other)
        f.inventory.containers.handle(
            f.actor,
            {
                type: 'take_chest_item',
                chestId: definition.id,
                itemInstanceId: required(view.items[0]).instanceId,
            },
            1000
        )
        f.actor.attackZones = [
            { ownerId: f.actor.id, minX: 160, maxX: 176, minY: 160, maxY: 176 },
        ]
        expect(f.inventory.openChestsHitBy(f.actor)).toHaveLength(1)
        expect(f.inventory.containers.snapshot(f.other, 1000)).toBeNull()
        expect(f.inventory.snapshotItems().map((item) => item.itemId)).toEqual([
            'fiber',
        ])
        expect(f.inventory.openChestsHitBy(f.actor)).toEqual([])
        expect(f.command().chest?.items).toEqual([])
        expect(f.inventory.snapshotItems()).toHaveLength(1)
    })
})
describe('barrel access boundaries', () => {
    it.each(['solid', 'wall'] as const)(
        'spills the same instances at safe actor feet if the computed point is %s',
        (obstruction) => {
            const f = fixture()
            const original = required(f.command().chest).items
            f.navigation.grid.solid[11 * 32 + 11] = true
            if (obstruction === 'solid') {
                f.navigation.grid.solid[10 * 32 + 11] = true
            }
            f.actor.attackZones = [
                {
                    ownerId: f.actor.id,
                    minX: 160,
                    maxX: 176,
                    minY: 160,
                    maxY: 176,
                },
            ]
            f.inventory.openChestsHitBy(f.actor)
            const items = f.inventory.snapshotItems()
            expect(items).toHaveLength(2)
            for (const item of items) {
                expect(item.position).toEqual(f.actor.position)
                expect(
                    f.navigation.isSolidTile(
                        f.navigation.worldToTile(item.position)
                    )
                ).toBe(false)
                expect(
                    f.navigation.hasLineOfSight(f.actor.position, item.position)
                ).toBe(true)
                f.inventory.pickupItem(f.actor, item.id, 1000)
            }
            expect(f.actor.inventory).toEqual(original)
            expect(f.inventory.openChestsHitBy(f.actor)).toEqual([])
            expect(f.inventory.snapshotItems()).toEqual([])
        }
    )
    it.each([
        'far',
        'wall',
        'dead',
        'offline',
        'retired',
        'locked',
        'location',
    ] as const)('rejects %s open and leaves all supplies', (reason) => {
        const f = fixture()
        if (reason === 'far') {
            f.actor.position.y = 205
        }
        if (reason === 'wall') {
            for (let x = 0; x < 32; x++) {
                f.navigation.grid.solid[11 * 32 + x] = true
            }
        }
        if (reason === 'dead') {
            f.actor.alive = false
        }
        if (reason === 'offline') {
            f.actor.tags.add('offline')
        }
        if (reason === 'retired') {
            f.actor.tags.add('state.retired')
        }
        if (reason === 'locked') {
            f.actor.lockAction(1000, 1000)
        }
        if (reason === 'location') {
            f.actor.locationId = 'map-1-1'
        }
        expect(f.command().accepted).toBe(false)
        expect(
            f.inventory
                .snapshotChests()
                .find((chest) => chest.id === definition.id)?.itemCount
        ).toBe(2)
        expect(f.actor.inventory).toEqual([])
    })
})
