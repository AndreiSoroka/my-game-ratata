import { INVENTORY_CAPACITY } from '@my-game-ratata/contracts'
import { describe, expect, it, vi } from 'vitest'

import { AdventureService } from '../src/game/adventure'
import { GameCharacter } from '../src/game/character'
import { Mob1Controller } from '../src/game/controllers'
import { createItemInstance } from '../src/game/inventory'
import { scavenge } from '../src/game/mobScavenging'
import { advanceCharacter } from '../src/game/movement'
import type { GameRoom } from '../src/game/room'
import { WorldInventory } from '../src/game/worldInventory'
import { chestHero, chestNavigation, now } from './chestTestHelpers'

function fixture() {
    const navigation = chestNavigation()
    const wallet = new AdventureService()
    const world = new WorldInventory(navigation, navigation.grid.id, wallet)
    const actor = new GameCharacter({
        id: 'scavenger',
        archetype: 'skeleton',
        controllerKind: 'mob1',
        faction: 'monsters',
        nickname: 'Scavenger',
        spawnPosition: { x: 100, y: 100 },
    })
    const giver = chestHero('giver', { x: 150, y: 100 })
    const item = createItemInstance('food')
    giver.inventory.push(item)
    world.applyInventoryAction(giver, 'drop', item.instanceId, now)
    return { actor, giver, item, navigation, world, wallet }
}

describe('ordinary mob scavenging', () => {
    it('walks to a visible item, carries the real instance and leaves it in its death container', () => {
        const f = fixture()
        const start = { ...f.actor.position }
        for (
            let at = now;
            at < now + 4_000 && f.actor.inventory.length === 0;
            at += 50
        ) {
            scavenge(f.actor, f.world, f.navigation, at, () => undefined)
            advanceCharacter({
                character: f.actor,
                navigation: f.navigation,
                now: at + 50,
                deltaMs: 50,
            })
        }
        expect(f.actor.position).not.toEqual(start)
        expect(f.actor.inventory).toEqual([f.item])
        expect(f.world.snapshotItems()).toEqual([])
        f.actor.applyDamage(f.actor.hp, now + 5_000)
        f.world.dropLootForDeaths(
            [{ kind: 'death', targetId: f.actor.id }],
            () => f.actor
        )
        const corpse = f.world
            .snapshotChests()
            .find((entry) => entry.kind === 'corpse')
        if (corpse === undefined) {
            throw new Error('Expected scavenger corpse')
        }
        f.giver.position = { ...corpse.position }
        f.world.openChestById(f.giver, corpse.id, now + 5_000)
        f.world.containers.handle(
            f.giver,
            { type: 'take_all_chest_items', chestId: corpse.id },
            now + 5_000
        )
        expect(f.giver.inventory).toEqual([f.item])
    })

    it('takes corpse gold at full capacity, then stops retrying uncarryable contents', () => {
        const f = fixture()
        const victim = new GameCharacter({
            id: 'victim',
            archetype: 'human',
            controllerKind: 'mob1',
            nickname: 'Victim',
            spawnPosition: f.actor.position,
        })
        victim.inventory.push(createItemInstance('boots'))
        f.wallet.grantGoldOnce(victim.id, 12, 'award')
        victim.applyDamage(victim.hp, now)
        f.world.dropLootForDeaths(
            [{ kind: 'death', targetId: victim.id }],
            () => victim
        )
        f.actor.inventory = Array.from({ length: INVENTORY_CAPACITY }, () =>
            createItemInstance('food')
        )
        expect(
            scavenge(f.actor, f.world, f.navigation, now, () => undefined)
        ).toBe(true)
        expect(f.wallet.snapshot(f.actor.id).gold).toBe(12)
        expect(
            scavenge(
                f.actor,
                f.world,
                f.navigation,
                now + 3_000,
                () => undefined
            )
        ).toBe(false)
        expect(f.world.containers.snapshot(f.actor, now)).toBeNull()
        f.actor.inventory.pop()
        expect(
            scavenge(
                f.actor,
                f.world,
                f.navigation,
                now + 4_000,
                () => undefined
            )
        ).toBe(true)
        expect(f.actor.inventory.at(-1)?.itemId).toBe('boots')
    })

    it('neither sees nor picks up a nearby item through a wall', () => {
        const f = fixture()
        const item = f.world.snapshotItems()[0]
        if (item === undefined) {
            throw new Error('Expected item')
        }
        f.actor.position = { x: item.position.x - 20, y: item.position.y }
        const tile = f.navigation.worldToTile({
            x: item.position.x - 10,
            y: item.position.y,
        })
        f.navigation.grid.solid[tile.y * f.navigation.grid.width + tile.x] =
            true
        expect(f.world.pickupItem(f.actor, item.id, now)).toEqual([])
        expect(
            scavenge(f.actor, f.world, f.navigation, now, () => undefined)
        ).toBe(false)
        expect(f.world.snapshotItems()).toHaveLength(1)
    })

    it('prioritizes visible combat threats over scavenging', () => {
        const f = fixture()
        const enemy = chestHero('enemy', { x: 110, y: 100 })
        const attack = vi.fn()
        const loot = vi.fn()
        const room = {
            findVisibleTarget: () => enemy,
            navigationFor: () => f.navigation,
            requestAttack: attack,
            requestScavenge: loot,
        } as unknown as GameRoom
        new Mob1Controller(1).update(f.actor, room, now)
        expect(attack).toHaveBeenCalledOnce()
        expect(loot).not.toHaveBeenCalled()
    })
})

describe('shared food validation', () => {
    it('does not consume food at full HP, while stunned, offline or action locked', () => {
        const f = fixture()
        const food = createItemInstance('food')
        f.actor.inventory.push(food)
        expect(
            f.world.applyInventoryAction(f.actor, 'eat', food.instanceId, now)
        ).toEqual([])
        f.actor.hp -= 5
        f.actor.stunUntil = now + 1_000
        expect(
            f.world.applyInventoryAction(f.actor, 'eat', food.instanceId, now)
        ).toEqual([])
        f.actor.stunUntil = 0
        f.actor.tags.add('offline')
        expect(
            f.world.applyInventoryAction(f.actor, 'eat', food.instanceId, now)
        ).toEqual([])
        f.actor.tags.delete('offline')
        f.actor.lockAction(now, 1_000)
        expect(
            f.world.applyInventoryAction(f.actor, 'eat', food.instanceId, now)
        ).toEqual([])
        expect(f.actor.inventory).toEqual([food])
        expect(
            f.world.applyInventoryAction(
                f.actor,
                'eat',
                food.instanceId,
                now + 1_000
            )
        ).toMatchObject([{ kind: 'item_eat', amount: 5 }])
        expect(f.actor.inventory).toEqual([])
        expect(
            f.world.applyInventoryAction(
                f.actor,
                'eat',
                food.instanceId,
                now + 1_000
            )
        ).toEqual([])
    })
})
