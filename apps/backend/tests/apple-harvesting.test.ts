import {
    type AdventureResourceNode,
    INVENTORY_CAPACITY,
} from '@my-game-ratata/contracts'
import { describe, expect, it, vi } from 'vitest'

import { AdventureResources } from '../src/game/adventureResources'
import { createAdventureState } from '../src/game/adventureState'
import { GameCharacter } from '../src/game/character'
import { TREE_GROW_MS } from '../src/game/harvestWork'
import {
    createItemInstance,
    type InventoryItemInstance,
} from '../src/game/inventory'
import { NavigationService } from '../src/game/navigation'
import { WorldInventory } from '../src/game/worldInventory'
import { required } from './containerTestHelpers'

function fixture(
    profile: 'apple' | 'forest' | 'pine' = 'apple',
    remaining = 8,
    roll = 0
) {
    const bounds = { x: 160, y: 160, width: 48, height: 32 }
    const node: AdventureResourceNode = {
        id: 'tree',
        treeProfile: profile,
        source: 'tree',
        kind: 'wood',
        phase: 'ready',
        remaining,
        locationId: 'map-2-2',
        position: { x: 184, y: 184 },
        bounds,
        matureBounds: bounds,
        collisionBounds: bounds,
    }
    const navigation = new NavigationService({
        id: node.locationId,
        width: 32,
        height: 32,
        tileWidth: 16,
        tileHeight: 16,
        solidLayerNames: [],
        solid: Array<boolean>(1024).fill(false),
        plantable: Array<boolean>(1024).fill(true),
    })
    const actor = new GameCharacter({
        id: 'woodcutter',
        nickname: 'Woodcutter',
        archetype: 'human',
        controllerKind: 'scripted',
        spawnPosition: { x: 184, y: 224 },
    })
    actor.inventory = []
    actor.equipment.weapon = createItemInstance('axe')
    const inventory = new WorldInventory(navigation)
    const random = vi.fn(() => roll)
    const dropped: InventoryItemInstance[] = []
    const resources = new AdventureResources([node], undefined, {
        random,
        drop: (who, item) => {
            dropped.push(item)
            inventory.dropItemNear(item, who.position)
        },
    })
    const state = createAdventureState()
    const clock = { now: 1000 }
    const update = () => resources.update(clock.now, () => navigation, [actor])
    update()
    const gather = () =>
        resources.gather(actor, state, node.id, clock.now, navigation)
    return {
        actor,
        inventory,
        random,
        resources,
        state,
        clock,
        update,
        gather,
        dropped,
        node,
        navigation,
    }
}

describe('real apple-tree food drops', () => {
    it.each([
        [0, true],
        [0.19999, true],
        [0.2, false],
        [0.99, false],
    ] as const)(
        'checks one 20 percent roll after accepted wood: %s',
        (roll, falls) => {
            const f = fixture('apple', 8, roll)
            expect(f.gather()[0]?.kind).toBe('resource_gather')
            expect(f.random).toHaveBeenCalledTimes(1)
            expect(f.actor.inventory.map((item) => item.itemId)).toEqual([
                'wood',
            ])
            expect(f.inventory.snapshotItems()).toHaveLength(falls ? 1 : 0)
            if (!falls) {
                return
            }
            const ground = required(f.inventory.snapshotItems()[0])
            expect(ground.itemId).toBe('food')
            f.clock.now += 2000
            expect(
                f.inventory.pickupItem(f.actor, ground.id, f.clock.now)[0]?.kind
            ).toBe('item_pickup')
            expect(f.actor.inventory).toContainEqual(f.dropped[0])
            expect(
                f.inventory.pickupItem(f.actor, ground.id, f.clock.now)
            ).toEqual([])
            expect(f.inventory.snapshotItems()).toEqual([])
        }
    )
    it.each(['forest', 'pine'] as const)(
        'never rolls for a %s tree',
        (profile) => {
            const f = fixture(profile)
            expect(f.gather()[0]?.kind).toBe('resource_gather')
            expect(f.random).not.toHaveBeenCalled()
            expect(f.inventory.snapshotItems()).toEqual([])
        }
    )
    it('rolls on the final cut but requires clearing the stump before a new forest tree can grow', () => {
        const f = fixture('apple', 1)
        f.gather()
        expect(f.random).toHaveBeenCalledTimes(1)
        expect(f.resources.snapshot()[0]).toMatchObject({
            phase: 'stump',
            treeProfile: 'apple',
        })
        f.clock.now += 2000
        const plant = () =>
            f.resources.handle(
                f.actor,
                f.state,
                { type: 'plant_tree', position: f.node.position },
                f.clock.now,
                f.navigation
            )
        expect(plant()).toEqual([])
        f.resources.handle(
            f.actor,
            f.state,
            { type: 'gather', nodeId: f.node.id, operation: 'clear_stump' },
            f.clock.now,
            f.navigation
        )
        expect(f.random).toHaveBeenCalledTimes(1)
        f.clock.now += 2000
        expect(plant()[0]?.kind).toBe('tree_plant')
        const planted = required(
            f.resources.snapshot().find((node) => node.id !== f.node.id)
        )
        expect(planted).toMatchObject({
            phase: 'growing',
            treeProfile: 'forest',
            treeSize: 'adult',
        })
        f.clock.now += TREE_GROW_MS
        f.update()
        f.resources.gather(
            f.actor,
            f.state,
            planted.id,
            f.clock.now,
            f.navigation
        )
        expect(f.random).toHaveBeenCalledTimes(1)
    })
    it('plants ordinary forest trees on new soil, with no apple roll', () => {
        const f = fixture()
        f.actor.position = { x: 344, y: 384 }
        f.actor.inventory = [createItemInstance('sapling')]
        f.resources.handle(
            f.actor,
            f.state,
            { type: 'plant_tree', position: { x: 344, y: 344 } },
            f.clock.now,
            f.navigation
        )
        const planted = required(
            f.resources.snapshot().find((node) => node.id !== 'tree')
        )
        expect(planted).toMatchObject({
            treeProfile: 'forest',
            phase: 'growing',
        })
        f.clock.now += TREE_GROW_MS
        f.update()
        expect(
            f.resources.gather(
                f.actor,
                f.state,
                planted.id,
                f.clock.now,
                f.navigation
            )[0]?.kind
        ).toBe('resource_gather')
        expect(f.random).not.toHaveBeenCalled()
    })
})

describe('rejected logging never rolls or creates food', () => {
    it.each([
        'dead',
        'offline',
        'retired',
        'energy',
        'broken',
        'full',
        'remote',
        'wall',
        'location',
        'cooldown',
        'stump',
    ] as const)('%s', (reason) => {
        const f = fixture('apple', reason === 'stump' ? 0 : 1)
        if (reason === 'dead') {
            f.actor.alive = false
        }
        if (reason === 'offline') {
            f.actor.tags.add('offline')
        }
        if (reason === 'retired') {
            f.actor.tags.add('state.retired')
        }
        if (reason === 'energy') {
            f.actor.energy = 0
        }
        if (reason === 'broken') {
            required(f.actor.equipment.weapon).durability = 0
        }
        if (reason === 'full') {
            f.actor.inventory = Array.from(
                { length: INVENTORY_CAPACITY - 2 },
                () => createItemInstance('food')
            )
        }
        if (reason === 'remote') {
            f.actor.position = { x: 450, y: 450 }
        }
        if (reason === 'wall') {
            vi.spyOn(f.navigation, 'hasLineOfSight').mockReturnValue(false)
        }
        if (reason === 'location') {
            f.actor.locationId = 'map-1-1'
        }
        if (reason === 'cooldown') {
            f.state.gatherAllowedAt = 2000
        }
        expect(f.gather()).toEqual([])
        expect(f.random).not.toHaveBeenCalled()
        expect(f.inventory.snapshotItems()).toEqual([])
    })
    it('does not reroll while the work cooldown is active', () => {
        const f = fixture()
        f.gather()
        f.gather()
        expect(f.random).toHaveBeenCalledTimes(1)
        expect(f.inventory.snapshotItems()).toHaveLength(1)
    })
})
