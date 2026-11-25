import { expect, it } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { npcQuestFixture } from './npcQuestFixture'

it('records information only after acceptance and makes repeated turn-in idempotent', () => {
    const f = npcQuestFixture()
    f.service.inspect(f.player.id, f.merchant.id, 'before')
    const id = f.accept()
    expect(f.service.snapshot(f.player.id, 20).quests?.[0]?.progress).toEqual([
        0,
    ])
    f.service.inspect(f.player.id, f.merchant.id, 'inspect:1')
    f.service.update(25)
    expect(f.service.snapshot(f.player.id, 25).quests?.[0]?.status).toBe(
        'ready'
    )
    expect(f.turnIn(id).accepted).toBe(true)
    expect(f.adventure.walletFor(f.player.id).gold).toBe(10)
    expect(f.turnIn(id).accepted).toBe(true)
    expect(f.adventure.walletFor(f.player.id).gold).toBe(10)
    expect(f.service.snapshot(f.player.id, 30).quests).toEqual([])
    expect(f.service.conversation(f.issuer.id, f.player.id)[0]?.receiptId).toBe(
        id
    )
})

it('rejects paid visits without a useful action but keeps unpaid movement objectives', () => {
    const f = npcQuestFixture()
    expect(
        f.service.propose(
            f.issuer,
            f.player.id,
            f.draft({
                objectives: [
                    { kind: 'visit', locationId: f.player.locationId },
                ],
            }),
            9
        ).accepted
    ).toBe(false)
    f.accept(
        f.draft({
            objectives: [{ kind: 'visit', locationId: f.player.locationId }],
            rewardGold: 0,
        })
    )
    f.service.update(21)
    expect(f.service.snapshot(f.player.id, 21).quests?.[0]?.progress).toEqual([
        0,
    ])
    f.player.position = { x: 81, y: 80 }
    f.service.update(22)
    expect(f.service.snapshot(f.player.id, 22).quests?.[0]?.progress).toEqual([
        1,
    ])
})

it('deduplicates real hostile deaths and refuses deaths predating acceptance', () => {
    const f = npcQuestFixture()
    const enemy = new GameCharacter({
        id: 'enemy',
        nickname: 'enemy',
        archetype: 'slime',
        controllerKind: 'mob1',
        faction: 'monsters',
        locationId: 'map-2-1',
        spawnPosition: { x: 80, y: 80 },
    })
    f.characters.set(enemy.id, enemy)
    f.player.locationId = enemy.locationId
    f.issuer.locationId = enemy.locationId
    enemy.applyDamage(enemy.hp, 1)
    const event = {
        kind: 'death' as const,
        actorId: f.player.id,
        targetId: enemy.id,
    }
    f.accept(
        f.draft({
            funding: 'personal',
            rewardGold: 0,
            objectives: [
                {
                    kind: 'defeat',
                    archetype: 'slime',
                    quantity: 2,
                    locationId: enemy.locationId,
                },
            ],
        })
    )
    f.service.observe([event])
    expect(f.service.snapshot(f.player.id, 21).quests?.[0]?.progress).toEqual([
        0,
    ])
    enemy.alive = true
    enemy.hp = enemy.maxHp
    enemy.applyDamage(enemy.hp, 25)
    f.service.observe([event, event])
    f.service.update(26)
    expect(f.service.snapshot(f.player.id, 26).quests?.[0]?.progress).toEqual([
        1,
    ])
})

it('applies each qualifying kill to the accepted contracts independently', () => {
    const f = npcQuestFixture()
    const locationId = 'map-2-1'
    f.player.locationId = locationId
    f.issuer.locationId = locationId
    const enemy = new GameCharacter({
        id: 'parallel-slime',
        nickname: 'Слизень',
        archetype: 'slime',
        controllerKind: 'mob1',
        faction: 'monsters',
        locationId,
        spawnPosition: { x: 80, y: 80 },
    })
    f.characters.set(enemy.id, enemy)
    const find = (id: string) => f.characters.get(id)
    const event = {
        kind: 'death' as const,
        actorId: f.player.id,
        targetId: enemy.id,
    }
    const observe = () => {
        f.parties.observe([event, event], find)
        f.service.observe([event, event])
        f.service.update(26)
    }
    const hunt = (title: string) =>
        f.draft({
            title,
            funding: 'personal',
            rewardGold: 0,
            objectives: [
                { kind: 'defeat', archetype: 'slime', quantity: 2, locationId },
            ],
        })
    f.parties.handle(
        f.player,
        { type: 'guild_accept', questId: 'slime_hunt' },
        f.characters.values(),
        10
    )
    const first = f.accept(hunt('Слизни на поле'))
    enemy.applyDamage(enemy.hp, 21)
    observe()
    const second = f.accept(hunt('Слизни у заставы'))
    observe()
    const progress = () =>
        f.service
            .snapshot(f.player.id, 26)
            .quests?.map(({ instanceId, progress }) => ({
                instanceId,
                progress: progress[0],
            }))
    expect(progress()).toEqual([
        { instanceId: first, progress: 1 },
        { instanceId: second, progress: 0 },
    ])
    enemy.alive = true
    enemy.hp = enemy.maxHp
    enemy.applyDamage(enemy.hp, 25)
    observe()
    expect(progress()).toEqual([
        { instanceId: first, progress: 2 },
        { instanceId: second, progress: 1 },
    ])
    expect(f.parties.boardActiveJobs(f.player.id)[0]?.progress).toBe(2)
    expect(f.turnIn(first).accepted).toBe(true)
    expect(progress()).toEqual([{ instanceId: second, progress: 1 }])
    expect(f.parties.boardActiveJobs(f.player.id)[0]?.progress).toBe(2)
})
