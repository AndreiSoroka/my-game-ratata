import {
    CENTER_LOCATION_ID,
    type MarketSnapshot,
} from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { adventureRecipes } from '../src/game/adventureResources'
import { GameCharacter } from '../src/game/character'
import { type CityState, takeQuantity } from '../src/game/cityEconomyStock'
import {
    addInventoryItems,
    countInventoryItem,
    craftInventoryItems,
    createItemInstance,
    transferInventoryItem,
} from '../src/game/inventory'
import { ProductionWorkOrders } from '../src/game/productionWorkOrders'

describe('canonical production work orders', () => {
    it('uses catalogue inputs and output when a controller supplies altered recipe fields', () => {
        const f = fixture()
        expect(
            f.orders.start(
                f.actor,
                { ...f.recipe, cost: {}, itemId: 'food' },
                0
            )
        ).toBe(true)
        expect(countInventoryItem(f.actor.inventory, 'scrap')).toBe(3)
        expect(countInventoryItem(f.actor.inventory, 'wood')).toBe(2)
        expect(f.orders.start(f.actor, f.recipe, 0)).toBe(false)
        f.craft()
        expect(f.orders.complete(f.actor, 0)).toBe(true)
        expect(countInventoryItem(f.city.inventory, 'axe')).toBe(1)
        expect(f.city.history).toEqual([
            { at: 0, itemId: 'axe', quantity: 1, kind: 'delivery' },
        ])
        expect(f.orders.complete(f.actor, 0)).toBe(false)
    })

    it('rolls back all input transfers when later ingredients or bag capacity are missing', () => {
        const f = fixture()
        takeQuantity(f.city.inventory, 'wood', 6)
        const before = structuredClone(f.city.inventory)
        expect(f.orders.start(f.actor, f.recipe, 0)).toBe(false)
        expect(f.city.inventory).toEqual(before)
        expect(f.actor.inventory).toHaveLength(0)
        addInventoryItems(
            f.city.inventory,
            [createItemInstance('wood', 6)],
            Infinity
        )
        addInventoryItems(f.actor.inventory, [createItemInstance('food', 49)])
        const stock = structuredClone(f.city.inventory)
        expect(f.orders.start(f.actor, f.recipe, 0)).toBe(false)
        expect(f.city.inventory).toEqual(stock)
        expect(f.actor.inventory).toHaveLength(49)
    })

    it('retains a real crafted output while the warehouse is full, then deposits once', () => {
        const f = fixture()
        expect(f.orders.start(f.actor, f.recipe, 0)).toBe(true)
        f.craft()
        const produced = f.actor.inventory[0]
        addInventoryItems(
            f.city.inventory,
            [createItemInstance('axe', 12)],
            Infinity
        )
        expect(f.orders.complete(f.actor, 0)).toBe(false)
        f.orders.reconcile(f.actor)
        expect(f.orders.has(f.actor.id)).toBe(true)
        expect(f.actor.inventory[0]).toBe(produced)
        takeQuantity(f.city.inventory, 'axe', 1)
        expect(f.orders.complete(f.actor, 0)).toBe(true)
        expect(f.city.inventory).toContain(produced)
        expect(f.actor.inventory).toHaveLength(0)
    })
})

describe('production loss and authority', () => {
    it.each(['inputs', 'output'] as const)(
        'cancels lost %s without recreating or refunding stolen goods',
        (loss) => {
            const f = fixture()
            expect(f.orders.start(f.actor, f.recipe, 0)).toBe(true)
            if (loss === 'output') {
                f.craft()
            }
            const stolen = f.actor.inventory[0]
            if (stolen === undefined) {
                throw new Error('Missing production item')
            }
            const thief = new GameCharacter({
                id: 'thief',
                nickname: 'thief',
                archetype: 'human',
                controllerKind: 'network_player',
                spawnPosition: { x: 100, y: 100 },
            })
            transferInventoryItem(
                f.actor.inventory,
                thief.inventory,
                stolen.instanceId
            )
            const warehouse = structuredClone(f.city.inventory)
            f.orders.reconcile(f.actor)
            expect(f.orders.has(f.actor.id)).toBe(false)
            expect(f.orders.complete(f.actor, 0)).toBe(false)
            expect(thief.inventory).toContain(stolen)
            expect(f.city.inventory).toEqual(warehouse)
        }
    )

    it('forgets a dead identity without returning its inventory to the warehouse', () => {
        const f = fixture()
        expect(f.orders.start(f.actor, f.recipe, 0)).toBe(true)
        const warehouse = structuredClone(f.city.inventory)
        const bag = structuredClone(f.actor.inventory)
        f.actor.applyDamage(f.actor.hp, 0)
        f.orders.reconcile(f.actor)
        expect(f.orders.has(f.actor.id)).toBe(false)
        expect(f.city.inventory).toEqual(warehouse)
        expect(f.actor.inventory).toEqual(bag)
        expect(f.orders.start(f.actor, f.recipe, 0)).toBe(false)
    })

    it('requires the authorized artisan at their workshop', () => {
        const f = fixture()
        f.actor.position.x += 49
        expect(f.orders.start(f.actor, f.recipe, 0)).toBe(false)
        f.actor.position.x -= 49
        f.actor.locationId = 'map-0-0'
        expect(f.orders.start(f.actor, f.recipe, 0)).toBe(false)
        const player = new GameCharacter({
            id: 'player',
            nickname: 'player',
            archetype: 'human',
            controllerKind: 'network_player',
            spawnPosition: { x: 100, y: 100 },
        })
        expect(f.orders.start(player, f.recipe, 0)).toBe(false)
    })
})

function fixture() {
    const actor = new GameCharacter({
        id: 'npc_smith_1',
        nickname: 'smith',
        archetype: 'human',
        controllerKind: 'scripted',
        spawnPosition: { x: 100, y: 100 },
    })
    const city: CityState = {
        inventory: [],
        lastConsumptionAt: new Map(),
        revision: 0,
        history: [],
    }
    addInventoryItems(
        city.inventory,
        [createItemInstance('wood', 6), createItemInstance('scrap', 6)],
        Infinity
    )
    const snapshot = (): MarketSnapshot => ({
        cityId: CENTER_LOCATION_ID,
        cityName: 'Test city',
        revision: city.revision,
        rows: [
            {
                itemId: 'axe',
                label: 'Axe',
                stock: countInventoryItem(city.inventory, 'axe'),
                target: 6,
                capacity: 12,
                basePrice: 25,
                fixedPrice: true,
                consumptionPer10Minutes: 0,
                buyPrice: 25,
                sellPrice: null,
                deliveredLast10Minutes: 0,
                consumedLast10Minutes: 0,
            },
        ],
    })
    const orders = new ProductionWorkOrders(
        (id) => (id === CENTER_LOCATION_ID ? city : undefined),
        snapshot
    )
    const recipe = adventureRecipes.find((entry) => entry.id === 'axe')
    if (recipe === undefined) {
        throw new Error('Missing axe recipe')
    }
    const craft = () => {
        const output = createItemInstance(recipe.itemId)
        expect(
            craftInventoryItems(actor.inventory, recipe.cost, [output])
        ).toBe(true)
        orders.recordCraftOutput(actor, recipe.id, output.instanceId)
    }
    return { actor, city, orders, recipe, craft }
}
