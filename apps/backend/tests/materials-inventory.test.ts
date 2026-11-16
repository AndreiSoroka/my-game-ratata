import {
    type AdventureResourceNode,
    canAcceptInventoryItem,
    FARM_PLOTS,
    INVENTORY_CAPACITY,
    type ItemInstanceSnapshot,
} from '@my-game-ratata/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AdventureService } from '../src/game/adventure'
import { createAdventureState } from '../src/game/adventureState'
import { GameCharacter } from '../src/game/character'
import { retireCharacter } from '../src/game/characterLife'
import { executeContainerCommand } from '../src/game/containerCommands'
import {
    addInventoryItems,
    countInventoryItem,
    createItemInstance,
} from '../src/game/inventory'
import { NavigationService } from '../src/game/navigation'
import { WorldInventory } from '../src/game/worldInventory'

afterEach(() => {
    vi.restoreAllMocks()
})

describe('gathered materials are ordinary bag items', () => {
    it.each(['network_player', 'scripted'] as const)(
        'merges herbs up to nine and rejects a whole extra unit when full for %s',
        (kind) => {
            const setup = fixture('herbs', kind)
            addInventoryItems(setup.actor.inventory, [
                createItemInstance('herbs', 8),
            ])
            fillFood(setup.actor, INVENTORY_CAPACITY - 1)
            const energy = setup.actor.energy
            setup.gather()
            expect(setup.snapshot().materials.herbs).toBe(9)
            expect(setup.actor.inventory).toHaveLength(INVENTORY_CAPACITY)
            expect(setup.snapshot().resourceNodes[0]?.remaining).toBe(1)
            setup.clock.now += 800
            const before = structuredClone(setup.actor.inventory)
            setup.gather()
            expect(setup.actor.inventory).toEqual(before)
            expect(setup.snapshot().resourceNodes[0]?.remaining).toBe(1)
            setup.actor.inventory.pop()
            setup.gather()
            expect(setup.snapshot().materials.herbs).toBe(10)
            expect(
                setup.actor.inventory
                    .filter((item) => item.itemId === 'herbs')
                    .map((item) => item.quantity ?? 1)
            ).toEqual([9, 1])
            expect(setup.actor.energy).toBe(energy)
            expect(setup.snapshot().resourceNodes[0]?.remaining).toBe(0)
        }
    )

    it('keeps wood in separate slots and does not deplete a node on a full-bag refusal', () => {
        const setup = fixture('wood')
        addInventoryItems(setup.actor.inventory, [createItemInstance('wood')])
        fillFood(setup.actor, INVENTORY_CAPACITY - 1)
        setup.gather()
        expect(setup.snapshot().materials.wood).toBe(1)
        expect(setup.snapshot().resourceNodes[0]?.remaining).toBe(2)
        setup.actor.inventory.pop()
        setup.gather()
        expect(
            setup.actor.inventory.filter((item) => item.itemId === 'wood')
        ).toHaveLength(2)
        expect(setup.snapshot().materials.wood).toBe(2)
    })

    it('does not maintain a second hidden material account', () => {
        const setup = fixture()
        setup.gather()
        expect(Object.hasOwn(createAdventureState(), 'materials')).toBe(false)
        expect(setup.snapshot().materials.herbs).toBe(1)
        setup.actor.inventory = []
        expect(setup.snapshot().materials.herbs).toBe(0)
        const copy = setup.snapshot()
        copy.materials.herbs = 999
        expect(setup.snapshot().materials.herbs).toBe(0)
    })
})

describe('whole harvests and barrel rewards', () => {
    it('fits the whole grain and seed yield before changing either stack', () => {
        const setup = fixture('herbs', 'network_player', () => 0.9)
        addInventoryItems(setup.actor.inventory, [
            createItemInstance('grain', 6),
            createItemInstance('wheat_seed', 8),
        ])
        fillFood(setup.actor, INVENTORY_CAPACITY - 2)
        const command = {
            type: 'farm_action',
            plotId: setup.plot.id,
            action: 'harvest',
        } as const
        const before = structuredClone(setup.actor.inventory)
        setup.service.handle(setup.actor, command, [])
        expect(setup.actor.inventory).toEqual(before)
        expect(setup.snapshot().farmPlots[0]?.phase).toBe('ripe')
        setup.actor.inventory.pop()
        setup.service.handle(setup.actor, command, [])
        expect(countInventoryItem(setup.actor.inventory, 'grain')).toBe(9)
        expect(
            setup.actor.inventory
                .filter((item) => item.itemId === 'wheat_seed')
                .map((item) => item.quantity ?? 1)
        ).toEqual([9, 1])
        expect(setup.actor.inventory).toHaveLength(INVENTORY_CAPACITY)
        expect(setup.snapshot().farmPlots[0]?.phase).toBe('bare')
    })

    it('keeps the ripe farm intact when only part of the grain would fit', () => {
        const setup = fixture()
        addInventoryItems(setup.actor.inventory, [
            createItemInstance('grain', 8),
        ])
        fillFood(setup.actor, INVENTORY_CAPACITY - 1)
        const energy = setup.actor.energy
        const command = {
            type: 'farm_action',
            plotId: setup.plot.id,
            action: 'harvest',
        } as const
        setup.service.handle(setup.actor, command, [])
        expect(setup.snapshot().materials.grain).toBe(8)
        expect(setup.snapshot().farmPlots[0]?.phase).toBe('ripe')
        expect(setup.actor.energy).toBe(energy)
        setup.actor.inventory.pop()
        setup.service.handle(setup.actor, command, [])
        expect(setup.snapshot().materials.grain).toBe(11)
        expect(
            setup.actor.inventory
                .filter((item) => item.itemId === 'grain')
                .map((item) => item.quantity ?? 1)
        ).toEqual([9, 2])
        expect(setup.snapshot().farmPlots[0]?.phase).toBe('bare')
        setup.clock.now += 800
        setup.service.handle(setup.actor, command, [])
        expect(setup.snapshot().materials.grain).toBe(11)
    })

    it('opens a full shared barrel without granting anything and takes only what fits', () => {
        const setup = fixture()
        fillFood(setup.actor, INVENTORY_CAPACITY - 1)
        const command = {
            type: 'world_interact',
            objectId: 'supplies',
        } as const
        setup.service.handle(setup.actor, command, [], setup.navigation)
        expect(
            setup.inventory.containers.snapshot(setup.actor, setup.clock.now)
                ?.items
        ).toHaveLength(2)
        expect(setup.snapshot().materials).toMatchObject({ wood: 0, fiber: 0 })
        setup.inventory.containers.handle(
            setup.actor,
            { type: 'take_all_chest_items', chestId: 'supplies' },
            setup.clock.now
        )
        expect(setup.snapshot().materials).toMatchObject({ wood: 1, fiber: 0 })
        expect(
            setup.inventory.containers.snapshot(setup.actor, setup.clock.now)
                ?.items
        ).toHaveLength(1)
        setup.actor.inventory.shift()
        setup.inventory.containers.handle(
            setup.actor,
            { type: 'take_all_chest_items', chestId: 'supplies' },
            setup.clock.now
        )
        expect(setup.snapshot().materials).toMatchObject({ wood: 1, fiber: 1 })
        setup.service.handle(setup.actor, command, [], setup.navigation)
        expect(setup.actor.inventory).toHaveLength(INVENTORY_CAPACITY)
    })
})

describe('crafting capacity after consuming bag materials', () => {
    it('crafts in a full bag when consuming the complete ingredient stack frees its result slot', () => {
        const setup = fixture()
        setup.service.handle(
            setup.actor,
            { type: 'farm_action', plotId: setup.plot.id, action: 'harvest' },
            []
        )
        fillFood(setup.actor, INVENTORY_CAPACITY - 1)
        expect(setup.actor.inventory).toHaveLength(INVENTORY_CAPACITY)
        setup.service.handle(
            setup.actor,
            { type: 'craft', recipeId: 'bake_bread' },
            []
        )
        expect(setup.snapshot().materials.grain).toBe(0)
        expect(setup.actor.inventory).toHaveLength(INVENTORY_CAPACITY)
        expect(countInventoryItem(setup.actor.inventory, 'food')).toBe(
            INVENTORY_CAPACITY
        )
        setup.service.handle(
            setup.actor,
            { type: 'craft', recipeId: 'bake_bread' },
            []
        )
        expect(countInventoryItem(setup.actor.inventory, 'food')).toBe(
            INVENTORY_CAPACITY
        )
    })

    it('preserves a partial ingredient stack when the output still cannot fit', () => {
        const setup = fixture()
        addInventoryItems(setup.actor.inventory, [
            createItemInstance('herbs', 6),
        ])
        fillFood(setup.actor, INVENTORY_CAPACITY - 1)
        const before = structuredClone(setup.actor.inventory)
        setup.service.handle(
            setup.actor,
            { type: 'craft', recipeId: 'food' },
            []
        )
        expect(setup.actor.inventory).toEqual(before)
        expect(setup.snapshot().materials.herbs).toBe(6)
        setup.actor.inventory.pop()
        setup.service.handle(
            setup.actor,
            { type: 'craft', recipeId: 'food' },
            []
        )
        expect(setup.snapshot().materials.herbs).toBe(3)
        expect(setup.actor.inventory).toHaveLength(INVENTORY_CAPACITY)
        expect(countInventoryItem(setup.actor.inventory, 'food')).toBe(
            INVENTORY_CAPACITY - 1
        )
    })
})

describe('material source of truth and capacity hints', () => {
    it('moves the actual quantity through ground loot and loses it on identity retirement', () => {
        const setup = fixture()
        addInventoryItems(setup.actor.inventory, [
            createItemInstance('herbs', 6),
        ])
        const instance = setup.actor.inventory[0]
        if (instance === undefined) {
            throw new Error('Missing herbs')
        }
        const world = new WorldInventory(setup.navigation)
        world.applyInventoryAction(setup.actor, 'drop', instance.instanceId)
        expect(setup.snapshot().materials.herbs).toBe(0)
        const loose = world.snapshotItems()[0]
        if (loose === undefined) {
            throw new Error('Missing ground stack')
        }
        expect(loose.quantity).toBe(6)
        setup.actor.position = { ...loose.position }
        world.pickupItem(setup.actor, loose.id, setup.clock.now)
        expect(setup.snapshot().materials.herbs).toBe(6)
        setup.service.observe([retireCharacter(setup.actor)], () => setup.actor)
        expect(setup.snapshot().materials.herbs).toBe(0)
    })

    it('predicts whole-stack fits with legacy quantity defaults and no partial transfer', () => {
        const bag: ItemInstanceSnapshot[] = [
            createItemInstance('herbs', 8),
            ...Array.from({ length: 49 }, () => createItemInstance('food')),
        ]
        expect(canAcceptInventoryItem(bag, createItemInstance('herbs'))).toBe(
            true
        )
        expect(
            canAcceptInventoryItem(bag, createItemInstance('herbs', 2))
        ).toBe(false)
        expect(canAcceptInventoryItem(bag, createItemInstance('wood'))).toBe(
            false
        )
        expect(
            canAcceptInventoryItem([], createItemInstance('grain', 10))
        ).toBe(true)
        expect(
            canAcceptInventoryItem([], {
                instanceId: 'bad',
                itemId: 'grain',
                quantity: 0,
            })
        ).toBe(false)
    })
})

function fixture(
    kind: AdventureResourceNode['kind'] = 'herbs',
    controllerKind: GameCharacter['controllerKind'] = 'network_player',
    farmRandom: () => number = () => 0
) {
    const plot = FARM_PLOTS[0]
    if (plot === undefined) {
        throw new Error('Missing shared farm')
    }
    const clock = { now: 1_000 }
    const actor = new GameCharacter({
        id: 'worker',
        archetype: 'human',
        controllerKind,
        nickname: 'Worker',
        spawnPosition: plot.position,
        locationId: plot.locationId,
    })
    const node: AdventureResourceNode = {
        id: 'node',
        locationId: plot.locationId,
        position: plot.position,
        kind,
        remaining: 2,
    }
    const navigation = new NavigationService({
        id: plot.locationId,
        width: 96,
        height: 80,
        tileWidth: 16,
        tileHeight: 16,
        solid: Array<boolean>(96 * 80).fill(false),
        solidLayerNames: [],
    })
    navigation.grid.containers = [
        {
            id: 'supplies',
            kind: 'barrel',
            title: 'Supplies',
            propId: 'supplies-prop',
            bounds: {
                x: actor.position.x + 16,
                y: actor.position.y - 8,
                width: 16,
                height: 16,
            },
            contents: [
                { itemId: 'wood', quantity: 1 },
                { itemId: 'fiber', quantity: 1 },
            ],
        },
    ]
    const inventory = new WorldInventory(navigation, plot.locationId)
    const service = new AdventureService({
        now: () => clock.now,
        farmRandom,
        resourceNodes: [node],
        openContainer: (who, id, now) =>
            executeContainerCommand(
                inventory.containers,
                who,
                { type: 'open_chest', chestId: id },
                now
            ),
        worldObjects: [
            {
                id: 'supplies',
                name: 'Supplies',
                text: '',
                kind: 'barrel',
                locationId: plot.locationId,
                bounds: {
                    x: actor.position.x + 16,
                    y: actor.position.y - 8,
                    width: 16,
                    height: 16,
                },
            },
        ],
    })
    return {
        actor,
        clock,
        plot,
        service,
        navigation,
        inventory,
        gather: () =>
            service.handle(actor, { type: 'gather', nodeId: node.id }, []),
        snapshot: () => service.snapshot(actor.id, actor.locationId, actor),
    }
}

function fillFood(actor: GameCharacter, count: number) {
    actor.inventory.push(
        ...Array.from({ length: count }, () => createItemInstance('food'))
    )
}
