import {
    FARM_PLOTS,
    FARM_SUPPLY_CHESTS,
    INVENTORY_CAPACITY,
    WORLD_LOCATION_DEFINITIONS,
} from '@my-game-ratata/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { createWorldChests } from '../src/game/chestInteraction'
import { countInventoryItem, createItemInstance } from '../src/game/inventory'
import { loadNavigationService } from '../src/game/navigation'
import { WorldInventory } from '../src/game/worldInventory'
import { generateFarmSupplyContents } from '../src/game/worldInventoryHelpers'
import { required } from './containerTestHelpers'

afterEach(() => vi.unstubAllGlobals())

describe('farm supply chest generation', () => {
    it.each([0.5, 0.999999])('leaves the chest empty for roll %s', (roll) => {
        const random = vi.fn(() => roll)
        expect(generateFarmSupplyContents(random)).toEqual([])
        expect(random).toHaveBeenCalledTimes(1)
    })

    it.each([
        [0, 2],
        [1 / 3, 3],
        [2 / 3, 4],
        [0.999999, 4],
    ])('uses equal quantity intervals: %s gives %s seeds', (roll, quantity) => {
        const random = vi
            .fn()
            .mockReturnValueOnce(0.499999)
            .mockReturnValueOnce(roll)
        const contents = generateFarmSupplyContents(random)
        expect(contents).toEqual([
            expect.objectContaining({ itemId: 'wheat_seed', quantity }),
        ])
        expect(random).toHaveBeenCalledTimes(2)
    })

    it('defines exactly one stable ordinary chest for each farm location', () => {
        const locations = WORLD_LOCATION_DEFINITIONS.filter(
            (location) => location.biome === 'outskirts'
        )
        expect(FARM_SUPPLY_CHESTS.map((chest) => chest.locationId)).toEqual(
            locations.map((location) => location.id)
        )
        expect(new Set(FARM_SUPPLY_CHESTS.map((chest) => chest.id)).size).toBe(
            FARM_SUPPLY_CHESTS.length
        )
    })

    it.each(FARM_SUPPLY_CHESTS)(
        '$locationId places its chest beside a reachable road without blocking a bed',
        (definition) => {
            vi.stubGlobal('Bun', { env: {} })
            const navigation = loadNavigationService(definition.locationId)
            const chests = createWorldChests(
                navigation,
                definition.locationId,
                () => 0
            )
            const chest = required(chests.get(definition.id))
            const road = { x: chest.position.x + 16, y: chest.position.y }
            expect(chest.position).toEqual({ x: 472, y: 712 })
            expect(chest.kind).toBeUndefined()
            expect(chest.opened).toBe(false)
            expect(
                navigation.isSolidTile(navigation.worldToTile(chest.position))
            ).toBe(false)
            expect(
                navigation.findPathWorld(road, chest.position).at(-1)
            ).toEqual(chest.position)
            expect(navigation.hasLineOfSight(road, chest.position)).toBe(true)
            expect(
                FARM_PLOTS.filter(
                    (plot) => plot.locationId === definition.locationId
                ).every(
                    (plot) =>
                        Math.hypot(
                            plot.position.x - chest.position.x,
                            plot.position.y - chest.position.y
                        ) > 16
                )
            ).toBe(true)
            expect(
                [...chests.values()]
                    .filter((item) =>
                        item.contents.some(
                            (entry) => entry.itemId === 'wheat_seed'
                        )
                    )
                    .map((item) => item.id)
            ).toEqual([definition.id])
        }
    )
})

describe('shared finite farm seeds', () => {
    it('keeps the same stack after capacity rejection and transfers it only once between viewers', () => {
        const { actor, other, definition, inventory, random } = fixture(0)
        const callsAtCreation = random.mock.calls.length
        inventory.openChestById(actor, definition.id, 1000)
        inventory.openChestById(other, definition.id, 1000)
        const seed = required(
            inventory.containers.snapshot(actor, 1000)?.items[0]
        )
        expect(seed).toMatchObject({ itemId: 'wheat_seed', quantity: 2 })
        const take = {
            type: 'take_chest_item',
            chestId: definition.id,
            itemInstanceId: seed.instanceId,
        } as const
        actor.inventory = Array.from({ length: INVENTORY_CAPACITY }, () =>
            createItemInstance('food')
        )
        expect(inventory.containers.handle(actor, take, 1000)[0]?.kind).toBe(
            'notice'
        )
        expect(inventory.containers.snapshot(other, 1000)?.items).toEqual([
            seed,
        ])
        actor.inventory = []
        expect(inventory.containers.handle(actor, take, 1000)[0]?.kind).toBe(
            'item_pickup'
        )
        expect(inventory.containers.handle(other, take, 1000)[0]?.kind).toBe(
            'notice'
        )
        expect(inventory.containers.handle(actor, take, 1000)[0]?.kind).toBe(
            'notice'
        )
        expect(actor.inventory).toEqual([seed])
        expect(countInventoryItem(other.inventory, 'wheat_seed')).toBe(0)
        for (const viewer of [actor, other]) {
            inventory.containers.handle(
                viewer,
                { type: 'close_chest', chestId: definition.id },
                1000
            )
            inventory.openChestById(viewer, definition.id, 1000)
            expect(inventory.containers.snapshot(viewer, 1000)?.items).toEqual(
                []
            )
        }
        expect(inventory.snapshotItems()).toEqual([])
        expect(random).toHaveBeenCalledTimes(callsAtCreation)
    })

    it('does not reroll an empty chest on inspection, close or reopening', () => {
        const { actor, definition, inventory, random } = fixture(0.999999)
        const callsAtCreation = random.mock.calls.length
        for (let attempt = 0; attempt < 3; attempt += 1) {
            inventory.openChestById(actor, definition.id, 1000)
            expect(inventory.containers.snapshot(actor, 1000)?.items).toEqual(
                []
            )
            inventory.containers.handle(
                actor,
                { type: 'close_chest', chestId: definition.id },
                1000
            )
        }
        expect(actor.inventory).toEqual([])
        expect(random).toHaveBeenCalledTimes(callsAtCreation)
    })
})

function fixture(roll: number) {
    vi.stubGlobal('Bun', { env: {} })
    const definition = required(FARM_SUPPLY_CHESTS[0])
    const navigation = loadNavigationService(definition.locationId)
    const random = vi.fn(() => roll)
    const inventory = new WorldInventory(
        navigation,
        definition.locationId,
        undefined,
        random
    )
    const character = (id: string, scripted = false) =>
        new GameCharacter({
            id,
            nickname: id,
            archetype: 'human',
            controllerKind: scripted ? 'scripted' : 'network_player',
            faction: 'peaceful',
            locationId: definition.locationId,
            spawnPosition: {
                x: definition.position.x + 16,
                y: definition.position.y,
            },
        })
    return {
        actor: character('farmer'),
        other: character('other', true),
        definition,
        inventory,
        random,
    }
}
