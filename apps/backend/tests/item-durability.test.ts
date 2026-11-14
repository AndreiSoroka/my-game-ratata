import {
    isItemBroken,
    ITEM_DEFINITIONS,
    itemDurability,
    itemRepairPrice,
} from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import {
    addInventoryItem,
    createItemInstance,
    equipInventoryItem,
    type InventoryItemInstance,
    snapshotItem,
    transferInventoryItem,
    unequipItem,
} from '../src/game/inventory'
import {
    repairItem,
    wearItem,
    wearWalkingEquipment,
} from '../src/game/itemDurability'
import { advanceCharacter } from '../src/game/movement'
import { NavigationService } from '../src/game/navigation'
import { abilityHero } from './abilityTestHelpers'

describe('durable item identity and restoration', () => {
    it('initializes current equipment and supports intact legacy instances without mutating reads', () => {
        for (const id of [
            'old_sword',
            'simple_sword',
            'axe',
            'pickaxe',
            'boots',
        ] as const) {
            const item = createItemInstance(id)
            expect(item.durability).toBe(ITEM_DEFINITIONS[id].maxDurability)
            expect(itemRepairPrice(item)).toBe(0)
            expect(snapshotItem(item).durability).toBe(item.durability)
        }
        const legacy = { instanceId: 'legacy', itemId: 'old_sword' as const }
        expect(snapshotItem(legacy).durability).toBe(200)
        expect(legacy).not.toHaveProperty('durability')
        expect(itemDurability(createItemInstance('food'))).toBeUndefined()
    })

    it('retains broken items, charges proportional repairs and does not repair twice', () => {
        const sword = createItemInstance('simple_sword')
        expect(wearItem(sword, 1)).toBe(false)
        expect(itemRepairPrice(sword)).toBe(1)
        expect(wearItem(sword, 99)).toBe(false)
        expect(itemRepairPrice(sword)).toBe(5)
        expect(wearItem(sword, 100)).toBe(true)
        expect(isItemBroken(sword)).toBe(true)
        expect(itemRepairPrice(sword)).toBe(10)
        expect(wearItem(sword, 1)).toBe(false)
        expect(repairItem(sword)).toBe(true)
        expect(sword.durability).toBe(200)
        expect(repairItem(sword)).toBe(false)
        expect(repairItem(createItemInstance('stone'))).toBe(false)
    })

    it('preserves condition and partial wear through stack splitting, transfers and equipment', () => {
        const boots = createItemInstance('boots', 2)
        boots.durability = 700
        boots.wearDistance = 400
        const chest: InventoryItemInstance[] = []
        expect(addInventoryItem(chest, boots)).toBe(true)
        expect(chest).toHaveLength(2)
        expect(chest[1]).toMatchObject({ durability: 700, wearDistance: 400 })
        const actor = abilityHero()
        expect(
            transferInventoryItem(chest, actor.inventory, boots.instanceId)
        ).toBeDefined()
        const equipped = equipInventoryItem(
            actor.inventory,
            actor.equipment,
            boots.instanceId
        )
        expect(equipped).toMatchObject({ durability: 700, wearDistance: 400 })
        if (equipped === undefined) {
            throw new Error('Expected equipped boots')
        }
        wearWalkingEquipment(actor, 559)
        expect(unequipItem(actor.inventory, actor.equipment, 'boots')).toBe(
            equipped
        )
        equipInventoryItem(actor.inventory, actor.equipment, boots.instanceId)
        wearWalkingEquipment(actor, 1)
        expect(equipped).toMatchObject({ durability: 699, wearDistance: 0 })
        expect(snapshotItem(equipped)).toMatchObject({ durability: 699 })
        expect(repairItem(equipped)).toBe(true)
        expect(equipped).not.toHaveProperty('wearDistance')
    })

    it.each([-1, 1001, NaN, Infinity, 0.5])(
        'rejects illegal condition %s atomically',
        (durability) => {
            const bag = [createItemInstance('food')]
            const before = structuredClone(bag)
            const item = { ...createItemInstance('boots'), durability }
            expect(addInventoryItem(bag, item)).toBe(false)
            expect(bag).toEqual(before)
        }
    )
})

describe('clothing wears from actual walking', () => {
    it.each(['network_player', 'scripted'] as const)(
        'uses collision-resolved displacement for %s',
        (controller) => {
            const actor = abilityHero('cleric', 'humanoid', controller)
            const boots = createItemInstance('boots')
            actor.equipment.boots = boots
            actor.position = { x: 8, y: 100 }
            const navigation = flatNavigation()
            actor.setMoveInput({ x: -1, y: 0 })
            advanceCharacter({
                character: actor,
                now: 1000,
                deltaMs: 1000,
                navigation,
            })
            expect(boots.durability).toBe(1000)
            actor.setMoveInput({ x: 1, y: 0 })
            for (let index = 1; index <= 110; index += 1) {
                advanceCharacter({
                    character: actor,
                    now: 1000 + index * 100,
                    deltaMs: 100,
                    navigation,
                })
            }
            expect(boots.durability).toBe(999)
            expect(boots.wearDistance).toBeCloseTo(30)
            actor.setMoveInput({ x: 0, y: 0 })
            advanceCharacter({
                character: actor,
                now: 13000,
                deltaMs: 1000,
                navigation,
            })
            expect(boots.wearDistance).toBeCloseTo(30)
            // Location crossing and resurrection placement never count as walking.
            actor.position = { x: 100, y: 100 }
            advanceCharacter({
                character: actor,
                now: 14000,
                deltaMs: 1000,
                navigation,
            })
            expect(boots.wearDistance).toBeCloseTo(30)
        }
    )

    it('retains fractional distance, stops at zero and has no tick-count wear', () => {
        const actor = abilityHero()
        const boots = createItemInstance('boots')
        actor.equipment.boots = boots
        boots.durability = 1
        for (let index = 0; index < 1000; index += 1) {
            wearWalkingEquipment(actor, 0.96)
        }
        expect(boots.durability).toBe(0)
        const before = structuredClone(boots)
        wearWalkingEquipment(actor, 960)
        expect(boots).toEqual(before)
    })
})

function flatNavigation(): NavigationService {
    return new NavigationService({
        id: 'map-2-2',
        width: 100,
        height: 100,
        tileWidth: 16,
        tileHeight: 16,
        solid: Array<boolean>(10_000).fill(false),
        solidLayerNames: [],
    })
}
