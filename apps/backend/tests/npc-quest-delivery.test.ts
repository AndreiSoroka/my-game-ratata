import { INVENTORY_CAPACITY } from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { countInventoryItem, createItemInstance } from '../src/game/inventory'
import { npcQuestFixture } from './npcQuestFixture'

it('settles pre-owned delivery and actual reward items between full bags atomically', () => {
    const f = npcQuestFixture()
    const sword = { ...createItemInstance('simple_sword'), durability: 123 }
    f.issuer.inventory = [
        sword,
        ...Array.from({ length: INVENTORY_CAPACITY - 1 }, () =>
            createItemInstance('boots')
        ),
    ]
    const bone = createItemInstance('bone')
    f.player.inventory = [
        bone,
        ...Array.from({ length: INVENTORY_CAPACITY - 1 }, () =>
            createItemInstance('boots')
        ),
    ]
    const id = f.accept(
        f.draft({
            objectives: [
                {
                    kind: 'deliver',
                    itemId: 'bone',
                    quantity: 1,
                    recipientId: f.issuer.id,
                },
            ],
            rewardItems: [{ instanceId: sword.instanceId, quantity: 1 }],
        })
    )
    expect(f.turnIn(id).accepted).toBe(true)
    expect(f.player.inventory).toHaveLength(INVENTORY_CAPACITY)
    expect(f.issuer.inventory).toHaveLength(INVENTORY_CAPACITY)
    expect(f.player.inventory).toContainEqual(
        expect.objectContaining({
            instanceId: sword.instanceId,
            durability: 123,
        })
    )
    expect(f.issuer.inventory).toContainEqual(
        expect.objectContaining({ instanceId: bone.instanceId })
    )
    expect(f.adventure.walletFor(f.player.id).gold).toBe(10)
    expect(f.turnIn(id).accepted).toBe(true)
    expect(f.adventure.walletFor(f.player.id).gold).toBe(10)
})

it('changes nothing when delivery plus reward cannot fit', () => {
    const f = npcQuestFixture()
    const sword = createItemInstance('simple_sword')
    f.issuer.inventory = [
        sword,
        ...Array.from({ length: INVENTORY_CAPACITY - 1 }, () =>
            createItemInstance('boots')
        ),
    ]
    f.player.inventory = [createItemInstance('bone')]
    const id = f.accept(
        f.draft({
            objectives: [
                {
                    kind: 'deliver',
                    itemId: 'bone',
                    quantity: 1,
                    recipientId: f.issuer.id,
                },
            ],
            rewardGold: 10,
        })
    )
    const before = JSON.stringify([f.issuer.inventory, f.player.inventory])
    expect(f.turnIn(id).accepted).toBe(false)
    expect(JSON.stringify([f.issuer.inventory, f.player.inventory])).toBe(
        before
    )
    expect(f.adventure.walletFor(f.player.id).gold).toBe(0)
    expect(f.adventure.snapshot(f.player.id)).not.toHaveProperty(
        'lastQuestRewardReceiptId'
    )
    expect(f.service.snapshot(f.player.id, 30).quest?.status).toBe('ready')
})

it('delivers accepted city supplies into the real warehouse beyond ordinary procurement capacity', () => {
    const f = npcQuestFixture()
    const warehouse = f.adventure.economy.questInventory(f.issuer.locationId)
    if (warehouse === undefined) {
        throw new Error('Missing warehouse')
    }
    warehouse.push(
        ...Array.from({ length: 4 }, () => createItemInstance('grain', 9))
    )
    const before = countInventoryItem(warehouse, 'grain')
    f.player.inventory = [createItemInstance('grain', 7)]
    const id = f.accept(
        f.draft({
            objectives: [
                {
                    kind: 'deliver',
                    itemId: 'grain',
                    quantity: 3,
                    recipientId: `city:${f.issuer.locationId}`,
                },
            ],
        })
    )
    expect(f.turnIn(id).accepted).toBe(true)
    expect(countInventoryItem(f.player.inventory, 'grain')).toBe(4)
    expect(countInventoryItem(warehouse, 'grain')).toBe(before + 3)
    expect(
        f.adventure.economy
            .snapshot(f.issuer.locationId, 30)
            ?.rows.find((row) => row.itemId === 'grain')?.deliveredLast10Minutes
    ).toBe(3)
})

it('keeps party gold mode and pays item rewards only to the submitter', () => {
    const f = npcQuestFixture()
    f.parties.handle(
        f.player,
        { type: 'party_invite', targetId: f.friend.id },
        f.characters.values(),
        0
    )
    const invitation = f.parties.snapshot(f.friend.id).invitations[0]
    f.parties.handle(
        f.friend,
        {
            type: 'party_answer',
            invitationId: invitation?.id ?? '',
            accept: true,
        },
        f.characters.values(),
        1
    )
    const food = createItemInstance('food')
    f.issuer.inventory = [food]
    const id = f.accept(
        f.draft({
            rewardGold: 11,
            rewardItems: [{ instanceId: food.instanceId, quantity: 1 }],
        }),
        'party_equal'
    )
    f.service.inspect(f.friend.id, f.merchant.id, 'friend:inspect')
    f.service.update(25)
    expect(f.turnIn(id).accepted).toBe(true)
    expect(f.adventure.walletFor(f.player.id).gold).toBe(6)
    expect(f.adventure.walletFor(f.friend.id).gold).toBe(5)
    expect(f.player.inventory).toContainEqual(food)
    expect(f.friend.inventory).toHaveLength(0)
    expect(f.service.cityFund(f.issuer.locationId)).toBe(289)
})

it('projects a successful turn-in receipt for an item-only reward', () => {
    const f = npcQuestFixture()
    const food = createItemInstance('food')
    f.issuer.inventory = [food]
    const id = f.accept(
        f.draft({
            rewardGold: 0,
            rewardItems: [{ instanceId: food.instanceId, quantity: 1 }],
        })
    )
    f.service.inspect(f.player.id, f.merchant.id, 'player:inspect')
    f.service.update(25)
    expect(f.turnIn(id).accepted).toBe(true)
    expect(f.player.inventory).toContainEqual(food)
    expect(f.adventure.snapshot(f.player.id)).toMatchObject({
        gold: 0,
        lastQuestRewardReceiptId: id,
    })
})

it('refuses a turn-in racing issuer death without taking the delivery', () => {
    const f = npcQuestFixture()
    const bone = createItemInstance('bone')
    f.player.inventory = [bone]
    const id = f.accept(
        f.draft({
            objectives: [
                {
                    kind: 'deliver',
                    itemId: 'bone',
                    quantity: 1,
                    recipientId: f.issuer.id,
                },
            ],
        })
    )
    f.issuer.applyDamage(f.issuer.hp, 29)
    expect(f.turnIn(id).accepted).toBe(false)
    expect(f.player.inventory).toContainEqual(bone)
    expect(f.adventure.walletFor(f.player.id).gold).toBe(0)
})

it('keeps a group contract with the current group after its original leader leaves', () => {
    const f = npcQuestFixture()
    f.parties.handle(
        f.player,
        { type: 'party_invite', targetId: f.friend.id },
        f.characters.values(),
        0
    )
    const invitation = f.parties.snapshot(f.friend.id).invitations[0]
    f.parties.handle(
        f.friend,
        {
            type: 'party_answer',
            invitationId: invitation?.id ?? '',
            accept: true,
        },
        f.characters.values(),
        1
    )
    const id = f.accept()
    f.parties.handle(
        f.player,
        { type: 'party_leave' },
        f.characters.values(),
        22
    )
    f.service.inspect(f.friend.id, f.merchant.id, 'remaining:inspect')
    f.service.update(25)
    expect(f.turnIn(id).accepted).toBe(false)
    expect(
        f.service.handle(
            f.friend,
            { type: 'npc_quest_turn_in', instanceId: id },
            30
        ).accepted
    ).toBe(true)
    expect(f.adventure.walletFor(f.friend.id).gold).toBe(10)
    expect(
        f.service.handle(
            f.friend,
            { type: 'npc_quest_turn_in', instanceId: id },
            30
        ).accepted
    ).toBe(true)
    expect(f.adventure.walletFor(f.friend.id).gold).toBe(10)
})
