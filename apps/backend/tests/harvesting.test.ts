import {
    ARTISAN_STARS,
    INVENTORY_CAPACITY,
    itemDurability,
} from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { createAdventureState } from '../src/game/adventureState'
import { GameCharacter } from '../src/game/character'
import { STONE_REGROW_MS, TREE_GROW_MS } from '../src/game/harvestResources'
import { countInventoryItem, createItemInstance } from '../src/game/inventory'
import { resourceChecks } from '../src/game/resourceObservation'
import { RewardReservations } from '../src/game/rewardReservations'
import { fixture, weapon } from './harvestTestHelpers'

it('uses authored gathering capabilities for a crafted stone axe', () => {
    const f = fixture()
    const tool = createItemInstance('stone_axe')
    f.actor.equipment.weapon = tool
    const energy = f.actor.energy
    expect(f.gather()[0]?.kind).toBe('notice')
    expect(itemDurability(tool)).toBe(99)
    expect(f.actor.energy).toBe(energy - 10)
    f.clock.now = 1_999
    expect(f.gather()).toEqual([])
    f.clock.now = 2_000
    expect(f.gather()[0]?.kind).toBe('notice')
    f.clock.now = 4_000
    expect(f.gather()[0]?.kind).toBe('resource_gather')
})

describe('shared authoritative logging and mining', () => {
    it.each([
        ['tree', 9, 'notice', 8],
        ['stone', 4.5, 'resource_gather', 7],
    ] as const)(
        'validates and charges the discounted cost for %s work',
        (source, cost, eventKind, remaining) => {
            const f = fixture(source)
            f.actor.energy = cost
            expect(f.gather()).toEqual([])
            expect(f.actor.energy).toBe(cost)

            f.actor.progression.constellations.opened.add('life.work')
            f.actor.energy = cost - 0.01
            expect(f.gather()).toEqual([])
            expect(f.actor.energy).toBe(cost - 0.01)
            expect(f.resources.snapshot()[0]?.remaining).toBe(8)
            f.actor.energy = cost
            expect(f.gather()[0]?.kind).toBe(eventKind)
            expect(f.actor.energy).toBe(0)
            expect(f.resources.snapshot()[0]?.remaining).toBe(remaining)
        }
    )

    it('turns each three blows into one log and yields the stump and saplings once', () => {
        const f = fixture()
        const tool = weapon(f.actor)
        const opened = f.actor.progression.constellations.opened
        for (let index = 1; index <= 24; index++) {
            f.actor.energy = 100
            const yieldsLog = index % 3 === 0
            expect(f.gather()[0]?.kind).toBe(
                yieldsLog ? 'resource_gather' : 'notice'
            )
            expect(countInventoryItem(f.actor.inventory, 'wood')).toBe(
                Math.floor(index / 3)
            )
            expect(opened.has(ARTISAN_STARS.root)).toBe(index === 24)
            f.clock.now += 2_000
        }
        expect(itemDurability(tool)).toBe(976)
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
        expect(countInventoryItem(f.actor.inventory, 'wood')).toBe(1)
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
        for (let index = 0; index < 3; index++) {
            f.gather()
            f.clock.now += 2_000
        }
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
        for (let index = 0; index < 3; index++) {
            f.gather()
            f.clock.now += 2_000
        }
        expect(
            f.resources.handle(
                npc,
                createAdventureState(),
                { type: 'gather', nodeId: f.node.id },
                f.clock.now,
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

describe('artisan logging', () => {
    it.each([
        [ARTISAN_STARS.hand, 2, 10],
        [ARTISAN_STARS.economy, 2, 7],
        [ARTISAN_STARS.oneStrike, 1, 7],
    ] as const)('applies the speed and energy of %s', (star, strikes, cost) => {
        const f = fixture()
        const opened = f.actor.progression.constellations.opened
        opened.add(ARTISAN_STARS.root)
        opened.add(ARTISAN_STARS.hand)
        opened.add(star)
        if (star === ARTISAN_STARS.oneStrike) {
            opened.add(ARTISAN_STARS.economy)
        }
        f.actor.energy = cost - 0.01
        expect(f.gather()).toEqual([])
        f.actor.energy = cost * strikes
        for (let index = 1; index <= strikes; index++) {
            expect(f.gather()[0]?.kind).toBe(
                index === strikes ? 'resource_gather' : 'notice'
            )
            f.clock.now += 2_000
        }
        expect(f.actor.energy).toBe(0)
        expect(countInventoryItem(f.actor.inventory, 'wood')).toBe(1)
        expect(weapon(f.actor).durability).toBe(1000 - strikes)
    })

    it('uses an unreserved bag axe ahead of a held sword, without changing equipment', () => {
        const f = fixture()
        const sword = createItemInstance('old_sword')
        const reserved = createItemInstance('axe')
        const working = createItemInstance('stone_axe')
        const broken = createItemInstance('axe')
        broken.durability = 0
        f.actor.equipment.weapon = sword
        f.actor.inventory.push(broken, reserved, working)
        const reservations = new RewardReservations()
        expect(
            reservations.reserve(
                'reward',
                { inventory: f.actor.inventory, wallet: { gold: 0 } },
                0,
                [{ instanceId: reserved.instanceId, quantity: 1 }]
            )
        ).toBe(true)

        f.actor.progression.constellations.opened.add(ARTISAN_STARS.root)
        expect(f.gather()[0]?.kind).toBe('notice')
        expect(f.actor.equipment.weapon).toBe(sword)
        expect(sword.durability).toBe(200)
        expect(reserved.durability).toBe(1000)
        expect(working.durability).toBe(99)
    })

    it('requires the root for using a bag tool and leaves mining costs unchanged', () => {
        const f = fixture('stone')
        const tool = weapon(f.actor)
        delete f.actor.equipment.weapon
        f.actor.inventory.push(tool)
        const energy = f.actor.energy
        expect(f.gather()).toEqual([])
        f.actor.progression.constellations.opened.add(ARTISAN_STARS.root)
        f.actor.progression.constellations.opened.add(ARTISAN_STARS.economy)
        expect(f.gather()[0]?.kind).toBe('resource_gather')
        expect(f.actor.energy).toBe(energy - 5)
        expect(tool.durability).toBe(999)
        expect(f.actor.equipment.weapon).toBeUndefined()
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
