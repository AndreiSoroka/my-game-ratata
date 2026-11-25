import { INVENTORY_CAPACITY } from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { createItemInstance } from '../src/game/inventory'
import { fixture } from './workerGuildFixture'

it('freezes completed participation when its owner later forms another party', () => {
    const f = fixture()
    f.accept()
    f.request.stage = 'ready'
    f.turnIn()
    const late = new GameCharacter({
        id: 'late',
        nickname: 'Поздний',
        archetype: 'human',
        controllerKind: 'network_player',
        spawnPosition: { x: 80, y: 80 },
    })
    f.guild.moveJob('solo:hero', 'party:later')
    f.guild.addLateMember('party:later', late)
    f.guild.removeMember('party:later', f.actor.id)
    expect(
        f.guild.conversation(f.clerk.id, late.id, 'party:later')
    ).toHaveLength(0)
    expect(
        f.guild.conversation(f.clerk.id, f.actor.id, 'solo:hero')[0]
            ?.participants
    ).toEqual([
        {
            id: f.actor.id,
            nickname: f.actor.nickname,
            contribution: 0,
            eligible: true,
        },
    ])
    expect(f.wallet.snapshot(late.id).gold).toBe(0)
})

it('reserves and debits the entire authored reward from the same finite city fund once', () => {
    const f = fixture()
    f.accept()
    expect(f.wallet.questFunding.availableGold(f.request.cityId)).toBe(270)
    expect(f.wallet.questFunding.wallet(f.request.cityId)?.gold).toBe(300)
    const id = f.instance()
    f.request.stage = 'ready'
    f.turnIn()
    f.turnIn(id)
    expect(f.wallet.questFunding.wallet(f.request.cityId)?.gold).toBe(270)
    expect(f.wallet.questFunding.availableGold(f.request.cityId)).toBe(270)
    expect(f.wallet.snapshot(f.actor.id)).toMatchObject({
        gold: 30,
        lastQuestRewardReceiptId: id,
    })
})

it('refuses an unfunded claim and releases reservations on abandonment and issuer death', () => {
    const f = fixture()
    const fund = f.wallet.questFunding.wallet(f.request.cityId)
    if (fund === undefined) {
        throw new Error('Missing city fund')
    }
    fund.gold = 29
    expect(f.accept()).toContain('недостаточно')
    expect(f.gateway.accept).not.toHaveBeenCalled()
    fund.gold = 300
    f.accept()
    f.guild.abandon('solo:hero', f.instance(), 1001)
    expect(f.wallet.questFunding.availableGold(f.request.cityId)).toBe(300)
    f.accept()
    f.clerk.applyDamage(f.clerk.hp, 1002)
    expect(f.wallet.questFunding.availableGold(f.request.cityId)).toBe(300)
    expect(f.guild.snapshots('solo:hero')).toEqual([])
})

it('settles negotiated gold and a real item atomically without consuming a second trophy', () => {
    const f = fixture()
    const apple = createItemInstance('food')
    f.clerk.inventory.push(apple)
    const trophy = createItemInstance('bone')
    f.actor.inventory.push(trophy)
    for (let index = 1; index < INVENTORY_CAPACITY; index++) {
        f.actor.inventory.push(createItemInstance('old_sword'))
    }
    f.guild.accept(
        'solo:hero',
        f.request.id,
        f.actor.id,
        f.members,
        f.characters,
        'submitter',
        1000,
        {
            rewardGold: 45,
            rewardItems: [{ instanceId: apple.instanceId, quantity: 1 }],
            issuerId: f.clerk.id,
            fundingCityId: f.request.cityId,
        }
    )
    f.request.stage = 'ready'
    expect(
        f.guild.snapshots('solo:hero')[0]?.rewardItems?.[0]?.instanceId
    ).toBe(apple.instanceId)
    f.turnIn()
    expect(f.gateway.complete).not.toHaveBeenCalled()
    expect(f.wallet.snapshot(f.actor.id).gold).toBe(0)
    expect(f.wallet.questFunding.wallet(f.request.cityId)?.gold).toBe(300)
    expect(f.clerk.inventory).toContain(apple)
    f.actor.inventory.pop()
    f.turnIn()
    expect(f.wallet.snapshot(f.actor.id).gold).toBe(45)
    expect(f.wallet.questFunding.wallet(f.request.cityId)?.gold).toBe(255)
    expect(
        f.actor.inventory.some((item) => item.instanceId === apple.instanceId)
    ).toBe(true)
    expect(
        f.actor.inventory.some((item) => item.instanceId === trophy.instanceId)
    ).toBe(true)
    expect(f.clerk.inventory).toHaveLength(0)
    expect(
        f.guild.conversation(f.clerk.id, f.actor.id, 'solo:hero')[0]?.status
    ).toBe('completed')
})

it('keeps a stolen promised item missing without paying or freeing the worker', () => {
    const f = fixture()
    const item = createItemInstance('food')
    f.clerk.inventory.push(item)
    f.guild.accept(
        'solo:hero',
        f.request.id,
        f.actor.id,
        f.members,
        f.characters,
        'submitter',
        1000,
        {
            rewardGold: 30,
            rewardItems: [{ instanceId: item.instanceId, quantity: 1 }],
            issuerId: f.clerk.id,
            fundingCityId: f.request.cityId,
        }
    )
    f.clerk.inventory.splice(0)
    f.request.stage = 'ready'
    f.turnIn()
    expect(f.guild.snapshots('solo:hero')[0]?.status).toBe('reward_missing')
    expect(f.gateway.complete).not.toHaveBeenCalled()
    expect(f.wallet.snapshot(f.actor.id).gold).toBe(0)
    expect(f.wallet.questFunding.wallet(f.request.cityId)?.gold).toBe(300)
})
