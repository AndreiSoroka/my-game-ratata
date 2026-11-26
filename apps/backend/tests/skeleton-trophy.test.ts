import assert from 'node:assert/strict'

import { INVENTORY_CAPACITY } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { restoreCharacter } from '../src/game/characterRecovery'
import type { WorldChest } from '../src/game/chestInteraction'
import {
    corpseReturnFinalized,
    defersCorpseRetirement,
    hasPendingCorpseReturn,
} from '../src/game/corpseReturns'
import { createItemInstance } from '../src/game/inventory'
import { WorldDeathLoot } from '../src/game/worldDeathLoot'
import { WorldInventory } from '../src/game/worldInventory'
import { chestHero, chestNavigation } from './chestTestHelpers'

function fixture(
    kind: 'hostile' | 'friendly' | 'player' | 'human-source' = 'hostile'
) {
    const actor = new GameCharacter({
        id: 'skeleton',
        nickname: 'Скелет',
        archetype: 'skeleton',
        controllerKind: kind === 'player' ? 'network_player' : 'mob1',
        faction: kind === 'friendly' ? 'peaceful' : 'monsters',
        mortal: false,
        spawnPosition: { x: 64, y: 64 },
    })
    if (kind === 'human-source') {
        actor.soul.controlSource = 'human'
    }
    const sword = createItemInstance('old_sword')
    actor.equipment.weapon = sword
    const corpses = new Map<string, WorldChest>()
    const loot = new WorldDeathLoot(actor.locationId, corpses)
    const deaths = [{ kind: 'death' as const, targetId: actor.id }]
    const die = (now: number) => {
        actor.applyDamage(actor.hp, now)
        actor.queueRespawn(now, 15_000)
        loot.resolve(deaths, () => actor)
    }
    return { actor, sword, corpses, loot, deaths, die }
}

describe('skeleton proof in finite shared corpse loot', () => {
    it('adds one bone beside the real sword and ignores repeated death receipts', () => {
        const f = fixture()
        f.die(1000)
        const contents = f.corpses.get('corpse:skeleton:1')?.contents
        expect(contents?.map((item) => item.itemId)).toEqual([
            'old_sword',
            'bone',
        ])
        expect(contents?.[0]).toBe(f.sword)
        expect(f.actor.equipment).toEqual({})
        expect(f.loot.resolve(f.deaths, () => f.actor)).toEqual([])
        expect(f.corpses.size).toBe(1)
        expect(contents).toHaveLength(2)
    })

    it('restores the same skeleton and weapon after one minute, then provides a fresh bone in its next death', () => {
        const f = fixture()
        f.die(1000)
        const first = f.corpses.get('corpse:skeleton:1')?.contents[1]
        f.actor.tickTimedState(16_000)
        expect(f.actor.alive).toBe(false)
        expect(f.loot.returns.advance(60_999, () => undefined)).toEqual([])
        expect(f.loot.returns.advance(61_000, () => undefined)).toMatchObject([
            { kind: 'revive', actorId: f.actor.id, targetId: f.actor.id },
        ])
        expect(f.actor.alive).toBe(true)
        expect(f.actor.hp).toBe(Math.ceil(f.actor.maxHp / 2))
        expect(f.actor.equipment.weapon).toBe(f.sword)
        expect(f.corpses.size).toBe(0)
        f.die(62_000)
        expect(f.corpses.size).toBe(1)
        const contents = f.corpses.get('corpse:skeleton:2')?.contents
        expect(contents?.map((item) => item.itemId)).toEqual([
            'old_sword',
            'bone',
        ])
        expect(contents?.[1]?.instanceId).not.toBe(first?.instanceId)
    })

    it.each(['friendly', 'player', 'human-source'] as const)(
        'does not mint a trophy for %s actors',
        (kind) => {
            const f = fixture(kind)
            f.die(1000)
            expect(
                [...f.corpses.values()]
                    .flatMap((corpse) => corpse.contents)
                    .map((item) => item.itemId)
            ).toEqual(['old_sword'])
        }
    )
})

function returningCorpse() {
    const { actor, sword } = fixture()
    const navigation = chestNavigation(actor.locationId)
    const player = chestHero('reader', { x: 72, y: 64 })
    const balances = new Map([[actor.id, 20]])
    const inventory = new WorldInventory(navigation, actor.locationId, {
        drainGold: (id) => {
            const gold = balances.get(id) ?? 0
            balances.delete(id)
            return gold
        },
        creditLootGold: (id, gold) => {
            balances.set(id, (balances.get(id) ?? 0) + gold)
            return true
        },
    })
    const diedAt = 10_000
    actor.applyDamage(actor.hp, diedAt)
    actor.queueRespawn(diedAt, 15_000)
    inventory.dropLootForDeaths(
        [{ kind: 'death', targetId: actor.id }],
        () => actor
    )
    const chestId = 'corpse:skeleton:1'
    inventory.openChestById(player, chestId, diedAt)
    const chest = inventory.containers.snapshot(player, diedAt)
    const boneId = chest?.items.find(
        ({ itemId }) => itemId === 'bone'
    )?.instanceId
    assert(boneId !== undefined)
    return {
        actor,
        sword,
        player,
        inventory,
        diedAt,
        chestId,
        boneId,
        balances,
    }
}

it('closes corpse inspection and rejects trophy collection at the exact return deadline', () => {
    const f = returningCorpse()
    const take = {
        type: 'take_chest_item' as const,
        chestId: f.chestId,
        itemInstanceId: f.boneId,
    }
    expect(
        f.inventory.containers.handle(f.player, take, f.diedAt + 60_000)
    ).toContainEqual(
        expect.objectContaining({ kind: 'revive', actorId: f.actor.id })
    )
    expect(
        f.inventory.containers.snapshot(f.player, f.diedAt + 60_000)
    ).toBeNull()
    expect(f.player.inventory).toEqual([])
    expect(f.actor.equipment.weapon).toBe(f.sword)
    expect(f.actor.hp).toBe(Math.ceil(f.actor.maxHp / 2))
    expect(f.balances.get(f.actor.id)).toBe(20)
    expect(f.inventory.advanceCorpseReturns(f.diedAt + 60_001)).toEqual([])
})

it('keeps the episode on a full bag and only a successfully collected bone ends it', () => {
    const f = returningCorpse()
    const take = {
        type: 'take_chest_item' as const,
        chestId: f.chestId,
        itemInstanceId: f.boneId,
    }
    f.player.inventory = Array.from({ length: INVENTORY_CAPACITY }, () =>
        createItemInstance('old_sword')
    )
    expect(
        f.inventory.containers.handle(f.player, take, f.diedAt + 1)[0]?.kind
    ).toBe('notice')
    expect(hasPendingCorpseReturn(f.actor)).toBe(true)
    f.player.inventory.pop()
    expect(
        f.inventory.containers.handle(f.player, take, f.diedAt + 2)[0]?.kind
    ).toBe('item_pickup')
    expect(hasPendingCorpseReturn(f.actor)).toBe(false)
    expect(f.actor.reviveUntil).toBe(0)
    expect(defersCorpseRetirement(f.actor, f.diedAt + 899)).toBe(true)
    expect(corpseReturnFinalized(f.actor, f.diedAt + 900)).toBe(true)
    expect(f.inventory.advanceCorpseReturns(f.diedAt + 60_000)).toEqual([])
    expect(f.actor.alive).toBe(false)
    expect(
        f.player.inventory.filter((item) => item.instanceId === f.boneId)
    ).toHaveLength(1)
})

it('discards the linked bone after a legal earlier revival and keeps the previously looted weapon with the collector', () => {
    const f = returningCorpse()
    f.inventory.containers.handle(
        f.player,
        {
            type: 'take_chest_item',
            chestId: f.chestId,
            itemInstanceId: f.sword.instanceId,
        },
        f.diedAt + 1
    )
    expect(hasPendingCorpseReturn(f.actor)).toBe(true)
    restoreCharacter(f.actor, f.diedAt + 3, false, {
        hp: 3,
        mana: 0,
        energy: 15,
    })
    expect(f.inventory.advanceCorpseReturns(f.diedAt + 3)).toEqual([])
    expect(
        f.inventory
            .snapshotChests(f.diedAt + 3)
            .some(({ id }) => id === f.chestId)
    ).toBe(false)
    expect(f.inventory.containers.snapshot(f.player, f.diedAt + 3)).toBeNull()
    expect(f.actor.hp).toBe(3)
    expect(f.actor.equipment).toEqual({})
    expect(f.balances.get(f.actor.id)).toBe(20)
    expect(f.player.inventory).toEqual([f.sword])
})
