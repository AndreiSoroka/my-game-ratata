import { expect, it } from 'vitest'

import {
    createItemInstance,
    transferInventoryItem,
} from '../src/game/inventory'
import {
    parseNpcQuestCommand,
    parseNpcQuestDecision,
} from '../src/game/npcQuestCommands'
import { availableInventoryQuantity } from '../src/game/rewardReservations'
import { npcQuestFixture } from './npcQuestFixture'

it('requires the exact server offer revision and explicit acceptance', () => {
    const f = npcQuestFixture()
    expect(
        f.service.propose(f.issuer, f.player.id, f.draft(), 10).accepted
    ).toBe(true)
    const offer = f.service.snapshot(f.player.id, 10).questOffer
    expect(f.service.snapshot(f.friend.id, 10).questOffer).toBeNull()
    expect(f.service.cityFund(f.issuer.locationId)).toBe(300)
    expect(
        f.service.handle(
            f.player,
            {
                type: 'quest_offer_answer',
                offerId: offer?.id ?? '',
                revision: 2,
                accept: true,
            },
            20
        ).accepted
    ).toBe(false)
    expect(f.service.snapshot(f.player.id, 20).quest).toBeNull()
    expect(
        f.service.handle(
            f.player,
            {
                type: 'quest_offer_answer',
                offerId: offer?.id ?? '',
                revision: 1,
                accept: true,
            },
            120_011
        ).accepted
    ).toBe(false)
})

it('uses the existing group slot and reserves a finite municipal budget once', () => {
    const f = npcQuestFixture()
    const id = f.accept(f.draft({ rewardGold: 300 }))
    expect(f.service.cityFund(f.issuer.locationId)).toBe(0)
    f.parties.handle(
        f.player,
        { type: 'guild_accept', questId: 'slime_hunt' },
        f.characters.values(),
        30
    )
    expect(f.parties.snapshot(f.player.id).activeJob).toBeNull()
    expect(
        f.service.propose(f.issuer, f.friend.id, f.draft(), 30).accepted
    ).toBe(false)
    expect(
        f.service.handle(
            f.player,
            { type: 'npc_quest_abandon', instanceId: id },
            40
        ).accepted
    ).toBe(true)
    expect(f.service.cityFund(f.issuer.locationId)).toBe(300)
    f.service.handle(
        f.player,
        { type: 'npc_quest_abandon', instanceId: id },
        40
    )
    expect(f.service.cityFund(f.issuer.locationId)).toBe(300)
    f.parties.handle(
        f.player,
        { type: 'guild_accept', questId: 'slime_hunt' },
        f.characters.values(),
        50
    )
    expect(f.parties.snapshot(f.player.id).activeJob?.id).toBe('slime_hunt')
    expect(
        f.service.propose(f.issuer, f.player.id, f.draft(), 60).accepted
    ).toBe(false)
    const offer = f.service.snapshot(f.player.id, 60).questOffer
    expect(
        f.service.handle(
            f.player,
            {
                type: 'quest_offer_answer',
                offerId: offer?.id ?? '',
                revision: 1,
                accept: true,
            },
            61
        ).accepted
    ).toBe(false)
})

it('rejects unknown mechanics, unauthorized municipal funding and fabricated possessions', () => {
    const f = npcQuestFixture()
    expect(
        parseNpcQuestDecision({
            type: 'quest_propose',
            targetId: f.player.id,
            draft: {
                ...f.draft(),
                objectives: [{ kind: 'invent_magic', code: 'grantGold(100)' }],
            },
        })
    ).toBeUndefined()
    expect(
        f.service.propose(f.merchant, f.player.id, f.draft(), 10).accepted
    ).toBe(false)
    expect(
        f.service.propose(f.issuer, f.merchant.id, f.draft(), 10).accepted
    ).toBe(false)
    f.friend.connected = false
    expect(
        f.service.propose(f.issuer, f.friend.id, f.draft(), 10).accepted
    ).toBe(false)
    expect(
        f.service.propose(
            f.issuer,
            f.player.id,
            f.draft({ rewardItems: [{ instanceId: 'fake', quantity: 1 }] }),
            10
        ).accepted
    ).toBe(false)
    expect(
        parseNpcQuestCommand({
            type: 'quest_offer_answer',
            offerId: 'x',
            revision: 1,
            accept: 'yes',
        })
    ).toBeUndefined()
})

it('leaves promised items stealable and reports missing rewards without inventing compensation', () => {
    const f = npcQuestFixture()
    const food = createItemInstance('food')
    f.issuer.inventory = [food]
    const id = f.accept(
        f.draft({ rewardItems: [{ instanceId: food.instanceId, quantity: 1 }] })
    )
    expect(
        availableInventoryQuantity(f.issuer.inventory, food.instanceId)
    ).toBe(0)
    expect(
        transferInventoryItem(
            f.issuer.inventory,
            f.friend.inventory,
            food.instanceId,
            undefined,
            true
        )
    ).toBeDefined()
    f.service.update(30)
    expect(f.service.snapshot(f.player.id, 30).quest?.status).toBe(
        'reward_missing'
    )
    expect(f.turnIn(id).accepted).toBe(false)
    expect(f.adventure.walletFor(f.player.id).gold).toBe(0)
    expect(f.friend.inventory).toContainEqual(food)
})

it('cancels on issuer death before ordinary loot and never puts the city fund into a purse', () => {
    const f = npcQuestFixture()
    const food = createItemInstance('food')
    f.issuer.inventory = [food]
    f.accept(
        f.draft({ rewardItems: [{ instanceId: food.instanceId, quantity: 1 }] })
    )
    expect(f.service.cityFund(f.issuer.locationId)).toBe(290)
    f.issuer.applyDamage(f.issuer.hp, 30)
    expect(f.service.snapshot(f.player.id, 30).quest).toBeNull()
    expect(f.service.conversation(f.issuer.id, f.player.id)[0]?.status).toBe(
        'cancelled'
    )
    expect(
        availableInventoryQuantity(f.issuer.inventory, food.instanceId)
    ).toBe(1)
    expect(f.service.cityFund(f.issuer.locationId)).toBe(300)
    expect(f.adventure.walletFor(f.issuer.id).gold).toBe(0)
    f.service.observe([{ kind: 'death', targetId: f.issuer.id }])
    expect(f.service.cityFund(f.issuer.locationId)).toBe(300)
})

it('requires renewed consent when the promised item condition changes before acceptance', () => {
    const f = npcQuestFixture()
    const sword = createItemInstance('simple_sword')
    f.issuer.inventory = [sword]
    expect(
        f.service.propose(
            f.issuer,
            f.player.id,
            f.draft({
                rewardItems: [{ instanceId: sword.instanceId, quantity: 1 }],
            }),
            10
        ).accepted
    ).toBe(true)
    const offer = f.service.snapshot(f.player.id, 10).questOffer
    sword.durability = 1
    expect(
        f.service.handle(
            f.player,
            {
                type: 'quest_offer_answer',
                offerId: offer?.id ?? '',
                revision: 1,
                accept: true,
            },
            20
        ).accepted
    ).toBe(false)
    expect(f.service.cityFund(f.issuer.locationId)).toBe(300)
    expect(f.service.snapshot(f.player.id, 20).quest).toBeNull()
})

it('does not substitute a damaged promised instance returned after theft', () => {
    const f = npcQuestFixture()
    const sword = createItemInstance('simple_sword')
    f.issuer.inventory = [sword]
    const id = f.accept(
        f.draft({
            rewardItems: [{ instanceId: sword.instanceId, quantity: 1 }],
        })
    )
    f.service.inspect(f.player.id, f.merchant.id, 'inspection:completed')
    expect(
        transferInventoryItem(
            f.issuer.inventory,
            f.friend.inventory,
            sword.instanceId,
            undefined,
            true
        )
    ).toBeDefined()
    const stolen = f.friend.inventory.find(
        (item) => item.instanceId === sword.instanceId
    )
    if (stolen === undefined) {
        throw new Error('Expected stolen reward')
    }
    stolen.durability = 1
    expect(
        transferInventoryItem(
            f.friend.inventory,
            f.issuer.inventory,
            sword.instanceId
        )
    ).toBeDefined()
    f.service.update(30)
    expect(f.service.snapshot(f.player.id, 30).quest?.status).toBe(
        'reward_missing'
    )
    expect(f.turnIn(id).accepted).toBe(false)
    expect(f.adventure.walletFor(f.player.id).gold).toBe(0)
    expect(f.issuer.inventory[0]?.instanceId).toBe(sword.instanceId)
    expect(f.player.inventory).toHaveLength(0)
})
