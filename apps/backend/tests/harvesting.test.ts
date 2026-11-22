import { INVENTORY_CAPACITY, itemDurability } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { createAdventureState } from '../src/game/adventureState'
import { GameCharacter } from '../src/game/character'
import { STONE_REGROW_MS, TREE_GROW_MS } from '../src/game/harvestResources'
import { countInventoryItem, createItemInstance } from '../src/game/inventory'
import { resourceChecks } from '../src/game/resourceObservation'
import { fixture, weapon } from './harvestTestHelpers'

it('uses authored gathering capabilities for a crafted stone axe', () => {
    const f = fixture()
    const tool = createItemInstance('stone_axe')
    f.actor.equipment.weapon = tool
    const energy = f.actor.energy
    expect(f.gather()[0]?.kind).toBe('resource_gather')
    expect(itemDurability(tool)).toBe(99)
    expect(f.actor.energy).toBe(energy - 5)
    f.clock.now = 1_999
    expect(f.gather()).toEqual([])
    f.clock.now = 2_000
    expect(f.gather()[0]?.kind).toBe('resource_gather')
})

describe('shared authoritative logging and mining', () => {
    it.each(['tree', 'stone'] as const)(
        'validates and charges the discounted cost for %s work',
        (source) => {
            const f = fixture(source)
            f.actor.energy = 4.5
            expect(f.gather()).toEqual([])
            expect(f.actor.energy).toBe(4.5)

            f.actor.progression.constellations.opened.add('life.work')
            f.actor.energy = 4.49
            expect(f.gather()).toEqual([])
            expect(f.actor.energy).toBe(4.49)
            expect(f.resources.snapshot()[0]?.remaining).toBe(8)
            f.actor.energy = 4.5
            expect(f.gather()[0]?.kind).toBe('resource_gather')
            expect(f.actor.energy).toBe(0)
            expect(f.resources.snapshot()[0]?.remaining).toBe(7)
        }
    )

    it('turns eight cuts into eight wood, a stump and two real saplings, wearing the axe once per result', () => {
        const f = fixture()
        const tool = weapon(f.actor)
        for (let index = 0; index < 8; index++) {
            f.actor.energy = 100
            expect(f.gather()[0]?.kind).toBe('resource_gather')
            f.clock.now += 2_000
        }
        expect(itemDurability(tool)).toBe(992)
        expect(countInventoryItem(f.actor.inventory, 'wood')).toBe(8)
        expect(countInventoryItem(f.actor.inventory, 'sapling')).toBe(2)
        expect(countInventoryItem(f.actor.inventory, 'brushwood')).toBe(1)
        expect(f.resources.snapshot()[0]).toMatchObject({
            phase: 'stump',
            remaining: 0,
            readyAt: 0,
        })
        expect(f.navigation.isSolidTile({ x: 10, y: 10 })).toBe(false)
        expect(f.navigation.isSolidTile({ x: 11, y: 11 })).toBe(true)
        expect(f.gather()).toEqual([])
        f.clock.now += TREE_GROW_MS * 10
        f.update()
        expect(f.resources.snapshot()[0]?.phase).toBe('stump')
    })

    it('wears a sword twenty times faster and enforces its longer work lock', () => {
        const f = fixture()
        const sword = createItemInstance('old_sword')
        f.actor.equipment.weapon = sword
        const energy = f.actor.energy
        f.gather()
        expect(itemDurability(sword)).toBe(180)
        expect(f.actor.energy).toBe(energy - 10)
        f.clock.now = 3_999
        expect(f.gather()).toEqual([])
        f.clock.now = 4_000
        f.gather()
        expect(itemDurability(sword)).toBe(160)
        sword.durability = 1
        f.clock.now = 8_000
        f.gather()
        expect(sword.durability).toBe(0)
        f.clock.now = 12_000
        expect(f.gather()).toEqual([])
        expect(countInventoryItem(f.actor.inventory, 'wood')).toBe(3)
    })

    it('keeps final wood, both saplings, tool, energy and source atomic when the bag is full', () => {
        const f = fixture('tree', 1)
        f.actor.inventory = Array.from({ length: INVENTORY_CAPACITY - 2 }, () =>
            createItemInstance('food')
        )
        const before = structuredClone(f.actor.inventory)
        const energy = f.actor.energy
        expect(f.gather()).toEqual([])
        expect(f.actor.inventory).toEqual(before)
        expect(f.actor.energy).toBe(energy)
        expect(itemDurability(weapon(f.actor))).toBe(1_000)
        expect(f.resources.snapshot()[0]?.remaining).toBe(1)
        f.actor.inventory.pop()
        f.actor.inventory.pop()
        f.gather()
        expect(f.actor.inventory).toHaveLength(INVENTORY_CAPACITY)
        expect(f.resources.snapshot()[0]?.phase).toBe('stump')
    })
})

describe('harvest refusal and shared source state', () => {
    it.each([
        'dead',
        'offline',
        'far',
        'wall',
        'wrong_location',
        'broken',
        'wrong_tool',
    ] as const)('rejects %s without costs or depletion', (failure) => {
        const f = fixture()
        if (failure === 'dead') {
            f.actor.alive = false
        }
        if (failure === 'offline') {
            f.actor.tags.add('offline')
        }
        if (failure === 'far') {
            f.actor.position.y += 100
        }
        if (failure === 'wrong_location') {
            f.actor.locationId = 'map-2-1'
        }
        if (failure === 'broken') {
            weapon(f.actor).durability = 0
        }
        if (failure === 'wrong_tool') {
            f.actor.equipment.weapon = createItemInstance('pickaxe')
        }
        if (failure === 'wall') {
            for (let x = 0; x < 32; x++) {
                f.navigation.grid.solid[12 * 32 + x] = true
            }
        }
        const energy = f.actor.energy
        const durability = itemDurability(weapon(f.actor))
        expect(f.gather()).toEqual([])
        expect(f.actor.energy).toBe(energy)
        expect(itemDurability(weapon(f.actor))).toBe(durability)
        expect(f.resources.snapshot()[0]?.remaining).toBe(8)
    })

    it('resolves contested final harvest once for both controllers', () => {
        const f = fixture('tree', 1)
        const npc = new GameCharacter({
            id: 'npc',
            nickname: 'Worker',
            archetype: 'human',
            controllerKind: 'scripted',
            spawnPosition: f.actor.position,
        })
        npc.equipment.weapon = createItemInstance('axe')
        f.gather()
        expect(
            f.resources.handle(
                npc,
                createAdventureState(),
                { type: 'gather', nodeId: f.node.id },
                0,
                f.navigation
            )
        ).toEqual([])
        expect(npc.inventory).toHaveLength(0)
        expect(itemDurability(npc.equipment.weapon)).toBe(1_000)
    })

    it('replenishes a mined stone only on the authoritative deadline update', () => {
        const f = fixture('stone', 1)
        f.gather()
        expect(f.resources.snapshot()[0]?.phase).toBe('depleted')
        expect(f.navigation.isSolidTile({ x: 11, y: 11 })).toBe(false)
        f.clock.now = STONE_REGROW_MS - 1
        f.update()
        expect(f.resources.snapshot()[0]?.remaining).toBe(0)
        f.clock.now++
        expect(f.resources.snapshot()[0]?.remaining).toBe(0)
        f.update()
        expect(f.resources.snapshot()[0]).toMatchObject({
            phase: 'ready',
            remaining: 8,
        })
        expect(f.navigation.isSolidTile({ x: 11, y: 11 })).toBe(true)
    })
})

describe('free soil planting', () => {
    function planting() {
        const f = fixture()
        f.actor.position = { x: 328, y: 376 }
        f.actor.inventory = [
            createItemInstance('sapling'),
            createItemInstance('sapling'),
        ]
        const plant = () =>
            f.resources.handle(
                f.actor,
                f.state,
                { type: 'plant_tree', position: { x: 328, y: 328 } },
                f.clock.now,
                f.navigation
            )
        return { ...f, plant }
    }

    it('applies the actual work discount to planting before consuming a sapling', () => {
        const f = planting()
        f.actor.energy = 4.5
        expect(f.plant()).toEqual([])
        expect(countInventoryItem(f.actor.inventory, 'sapling')).toBe(2)

        f.actor.progression.constellations.opened.add('life.work')
        expect(resourceChecks(f.actor).plantEnergyCost).toBe(4.5)
        expect(f.plant()[0]?.kind).toBe('tree_plant')
        expect(f.actor.energy).toBe(0)
        expect(countInventoryItem(f.actor.inventory, 'sapling')).toBe(1)
    })

    it('consumes one real seed, waits ten minutes without snapshot side effects and grows only into vacant land', () => {
        const f = planting()
        expect(f.plant()[0]?.kind).toBe('tree_plant')
        expect(countInventoryItem(f.actor.inventory, 'sapling')).toBe(1)
        const planted = () =>
            f.resources.snapshot().find((node) => node.id.includes(':planted:'))
        expect(planted()).toMatchObject({
            phase: 'growing',
            remaining: 0,
            readyAt: TREE_GROW_MS,
        })
        f.clock.now = TREE_GROW_MS
        expect(planted()?.phase).toBe('growing')
        f.actor.position = { x: 312, y: 312 }
        f.update()
        expect(planted()?.phase).toBe('growing')
        f.actor.position = { x: 328, y: 376 }
        f.update()
        expect(planted()).toMatchObject({ phase: 'ready', remaining: 8 })
        expect(f.navigation.isSolidTile({ x: 19, y: 19 })).toBe(true)
    })

    it('rejects roads, overlapping trees, duplicate commands and corpse footprints without consuming seeds', () => {
        const f = planting()
        f.plantable[19 * 32 + 19] = false
        expect(f.plant()).toEqual([])
        expect(countInventoryItem(f.actor.inventory, 'sapling')).toBe(2)
        f.plantable[19 * 32 + 19] = true
        f.resources.update(
            0,
            () => f.navigation,
            [f.actor],
            () => [{ x: 320, y: 320, width: 16, height: 16 }]
        )
        expect(f.plant()).toEqual([])
        f.update()
        f.plant()
        f.clock.now += 2_000
        expect(f.plant()).toEqual([])
        expect(countInventoryItem(f.actor.inventory, 'sapling')).toBe(1)
    })

    it('rejects a trunk that would cut the only walkable corridor', () => {
        const f = planting()
        f.navigation.grid.solid.fill(true)
        for (let y = 4; y < 28; y++) {
            f.navigation.grid.solid[y * 32 + 20] = false
        }
        expect(f.plant()).toEqual([])
        expect(countInventoryItem(f.actor.inventory, 'sapling')).toBe(2)
    })
})
