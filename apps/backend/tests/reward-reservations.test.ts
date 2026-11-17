import { expect, it } from 'vitest'

import { createAdventureState } from '../src/game/adventureState'
import { planAssetSettlement } from '../src/game/assetSettlement'
import { transferQuantity } from '../src/game/cityEconomyStock'
import { spendWallet } from '../src/game/corpseWallet'
import {
    consumeInventoryItems,
    craftInventoryItems,
    createItemInstance,
    equipInventoryItem,
    type InventoryItemInstance,
    removeInventoryItem,
    transferInventoryItem,
    transferInventoryQuantity,
} from '../src/game/inventory'
import {
    availableGold,
    availableInventoryQuantity,
    RewardReservations,
} from '../src/game/rewardReservations'

function assets() {
    const herbs = createItemInstance('herbs', 8)
    const sword = createItemInstance('simple_sword')
    const inventory = [herbs, sword]
    const wallet = createAdventureState()
    wallet.gold = 15
    const reservations = new RewardReservations()
    expect(
        reservations.reserve('quest', { inventory, wallet }, 10, [
            { instanceId: herbs.instanceId, quantity: 3 },
            { instanceId: sword.instanceId, quantity: 1 },
        ])
    ).toBe(true)
    return { herbs, sword, inventory, wallet, reservations }
}

it('conserves a finite purse and releases each reservation once', () => {
    const f = assets()
    expect(availableGold(f.wallet)).toBe(5)
    expect(spendWallet(f.wallet, 6)).toBe(false)
    expect(spendWallet(f.wallet, 5)).toBe(true)
    expect(f.wallet.gold).toBe(10)
    expect(f.reservations.reserve('other', f, 1, [])).toBe(false)
    expect(f.reservations.release('quest')).toBe(true)
    expect(f.reservations.release('quest')).toBe(false)
    expect(spendWallet(f.wallet, 10)).toBe(true)
})

it('blocks equip, remove and whole-stack voluntary transfer of promised instances', () => {
    const f = assets()
    expect(
        equipInventoryItem(f.inventory, {}, f.sword.instanceId)
    ).toBeUndefined()
    expect(removeInventoryItem(f.inventory, f.sword.instanceId)).toBeUndefined()
    expect(
        transferInventoryItem(f.inventory, [], f.herbs.instanceId)
    ).toBeUndefined()
    expect(f.inventory).toHaveLength(2)
    expect(f.reservations.valid('quest')).toBe(true)
})

it('allows consumption and craft only from the unpromised quantity', () => {
    const f = assets()
    expect(consumeInventoryItems(f.inventory, { herbs: 6 })).toBe(false)
    expect(
        craftInventoryItems(f.inventory, { herbs: 6 }, [
            createItemInstance('food'),
        ])
    ).toBe(false)
    expect(consumeInventoryItems(f.inventory, { herbs: 5 })).toBe(true)
    expect(f.inventory[0]?.instanceId).toBe(f.herbs.instanceId)
    expect(f.inventory[0]?.quantity).toBe(3)
    expect(availableInventoryQuantity(f.inventory, f.herbs.instanceId)).toBe(0)
    expect(f.reservations.valid('quest')).toBe(true)
})

it('permits real theft of a reserved reward and detects the missing promise', () => {
    const f = assets()
    const thief: InventoryItemInstance[] = []
    expect(
        transferInventoryItem(
            f.inventory,
            thief,
            f.sword.instanceId,
            undefined,
            true
        )
    ).toBeDefined()
    expect(thief[0]?.instanceId).toBe(f.sword.instanceId)
    expect(f.reservations.valid('quest')).toBe(false)
    expect(f.reservations.release('quest')).toBe(true)
    expect(availableGold(f.wallet)).toBe(15)
    expect(thief).toHaveLength(1)
})

it('splits a free stack portion without moving reserved identity', () => {
    const f = assets()
    const other: InventoryItemInstance[] = []
    const moved = transferInventoryQuantity(
        f.inventory,
        other,
        f.herbs.instanceId,
        5
    )
    expect(moved?.instanceId).not.toBe(f.herbs.instanceId)
    expect(f.inventory[0]?.instanceId).toBe(f.herbs.instanceId)
    expect(f.inventory[0]?.quantity).toBe(3)
    expect(f.reservations.valid('quest')).toBe(true)
})

it('market transfers respect reservations even though the warehouse has unlimited capacity', () => {
    const f = assets()
    const city: InventoryItemInstance[] = []
    expect(transferQuantity(f.inventory, city, 'herbs', 6, Infinity)).toBe(
        false
    )
    expect(city).toHaveLength(0)
    expect(transferQuantity(f.inventory, city, 'herbs', 5, Infinity)).toBe(true)
    expect(f.inventory[0]?.instanceId).toBe(f.herbs.instanceId)
    expect(f.reservations.valid('quest')).toBe(true)
})

it('prepares funded reward and delivery as one operation and rejects a stale plan', () => {
    const f = assets()
    const player = [createItemInstance('stone')]
    const wallet = { gold: 0 }
    const request = {
        reservationId: 'quest',
        items: [
            {
                from: player,
                to: f.inventory,
                items: [
                    { instanceId: player[0]?.instanceId ?? '', quantity: 1 },
                ],
            },
            {
                from: f.inventory,
                to: player,
                items: [{ instanceId: f.sword.instanceId, quantity: 1 }],
            },
        ],
        gold: [{ from: f.wallet, to: wallet, amount: 10 }],
    }
    const stale = planAssetSettlement(request)
    expect(stale).toBeDefined()
    player[0] = createItemInstance('wood')
    expect(stale?.commit()).toBe(false)
    expect(wallet.gold).toBe(0)
    expect(f.wallet.gold).toBe(15)
    expect(f.inventory).toHaveLength(2)
    request.items[0] = {
        from: player,
        to: f.inventory,
        items: [{ instanceId: player[0].instanceId, quantity: 1 }],
    }
    const current = planAssetSettlement(request)
    expect(current?.commit()).toBe(true)
    expect(current?.commit()).toBe(false)
    expect(player[0].itemId).toBe('simple_sword')
    expect(wallet.gold).toBe(10)
    expect(f.wallet.gold).toBe(5)
})

it('rejects invalid quantities, duplicate reservations and cumulative outgoing overspend', () => {
    const f = assets()
    expect(f.reservations.reserve('quest', f, 0, [])).toBe(false)
    expect(f.reservations.reserve('bad', f, -1, [])).toBe(false)
    expect(
        planAssetSettlement({
            items: [],
            gold: [
                { from: f.wallet, to: { gold: 0 }, amount: 3 },
                { from: f.wallet, to: { gold: 0 }, amount: 3 },
            ],
        })
    ).toBeUndefined()
    expect(
        planAssetSettlement({
            items: [
                {
                    from: f.inventory,
                    to: [],
                    items: [
                        { instanceId: f.herbs.instanceId, quantity: 2 },
                        { instanceId: f.herbs.instanceId, quantity: 4 },
                    ],
                },
            ],
            gold: [],
        })
    ).toBeUndefined()
    expect(f.wallet.gold).toBe(15)
})
