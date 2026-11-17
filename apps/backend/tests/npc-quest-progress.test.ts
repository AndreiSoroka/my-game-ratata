import { expect, it } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { npcQuestFixture } from './npcQuestFixture'

it('records information only after acceptance and makes repeated turn-in idempotent', () => {
    const f = npcQuestFixture()
    f.service.inspect(f.player.id, f.merchant.id, 'before')
    const id = f.accept()
    expect(f.service.snapshot(f.player.id, 20).quest?.progress).toEqual([0])
    f.service.inspect(f.player.id, f.merchant.id, 'inspect:1')
    f.service.update(25)
    expect(f.service.snapshot(f.player.id, 25).quest?.status).toBe('ready')
    expect(f.turnIn(id).accepted).toBe(true)
    expect(f.adventure.walletFor(f.player.id).gold).toBe(10)
    expect(f.turnIn(id).accepted).toBe(true)
    expect(f.adventure.walletFor(f.player.id).gold).toBe(10)
    expect(f.service.snapshot(f.player.id, 30).quest?.receiptId).toBe(id)
})

it('requires authoritative movement after accepting a visit objective', () => {
    const f = npcQuestFixture()
    f.accept(
        f.draft({
            objectives: [{ kind: 'visit', locationId: f.player.locationId }],
        })
    )
    f.service.update(21)
    expect(f.service.snapshot(f.player.id, 21).quest?.progress).toEqual([0])
    f.player.position = { x: 81, y: 80 }
    f.service.update(22)
    expect(f.service.snapshot(f.player.id, 22).quest?.progress).toEqual([1])
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
    expect(f.service.snapshot(f.player.id, 21).quest?.progress).toEqual([0])
    enemy.alive = true
    enemy.hp = enemy.maxHp
    enemy.applyDamage(enemy.hp, 25)
    f.service.observe([event, event])
    f.service.update(26)
    expect(f.service.snapshot(f.player.id, 26).quest?.progress).toEqual([1])
})
