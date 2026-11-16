import { INVENTORY_CAPACITY } from '@my-game-ratata/contracts'
import { describe, expect, it, vi } from 'vitest'

import { AdventureService } from '../src/game/adventure'
import { parseAgentDecision } from '../src/game/agentDecisions'
import { GameCharacter } from '../src/game/character'
import {
    setCharacterControl,
    snapshotControl,
} from '../src/game/characterControl'
import { advanceRevive, beginRevive } from '../src/game/characterLife'
import { createItemInstance } from '../src/game/inventory'
import { parseClientMessage } from '../src/game/messages'
import { advanceRoomLives } from '../src/game/roomLifecycle'
import { WorldInventory } from '../src/game/worldInventory'
import { chestHero, chestNavigation, now } from './chestTestHelpers'

function fixture(mortal = true) {
    const actor = new GameCharacter({
        id: 'fallen',
        archetype: mortal ? 'human' : 'skeleton',
        controllerKind: 'mob1',
        mortal,
        nickname: 'Павший',
        faction: 'peaceful',
        spawnPosition: { x: 100, y: 100 },
    })
    const item = createItemInstance('herbs', 8)
    const weapon = createItemInstance('old_sword')
    actor.inventory.push(item)
    actor.equipment.weapon = weapon
    const wallet = new AdventureService()
    wallet.grantGoldOnce(actor.id, 37, 'test-reward')
    const navigation = chestNavigation()
    const world = new WorldInventory(navigation, actor.locationId, wallet)
    actor.applyDamage(actor.hp, now)
    actor.queueRespawn(now, 15_000)
    const deaths = [{ kind: 'death' as const, targetId: actor.id }]
    const viewer = chestHero('viewer', actor.position)
    return {
        actor,
        navigation,
        item,
        weapon,
        wallet,
        world,
        viewer,
        deaths,
        corpse: () => {
            const corpse = world
                .snapshotChests()
                .find((entry) => entry.kind === 'corpse')
            if (corpse === undefined) {
                throw new Error('Expected corpse')
            }
            return corpse
        },
        takeAll: () =>
            world.containers.handle(
                viewer,
                { type: 'take_all_chest_items', chestId: `corpse:fallen:1` },
                now + 60_000
            ),
    }
}

describe('protected mortal possessions', () => {
    it('keeps all possessions safe until final death, then transfers before retirement clears them', () => {
        const f = fixture()
        expect(f.world.dropLootForDeaths(f.deaths, () => f.actor)).toEqual([])
        expect(f.world.finalizeDeath(f.actor, now + 59_999)).toEqual([])
        expect(
            f.world.snapshotChests().filter((entry) => entry.kind === 'corpse')
        ).toEqual([])
        expect(f.actor.inventory).toEqual([f.item])
        expect(f.wallet.snapshot(f.actor.id).gold).toBe(37)
        const characters = new Map([[f.actor.id, f.actor]])
        advanceRoomLives({
            characters,
            connections: new Map(),
            controllers: new Map(),
            nicknames: new Map(),
            now: now + 60_000,
            beforeRetire: (actor, at) => {
                f.world.finalizeDeath(actor, at)
            },
            onEvents: (events) => {
                f.wallet.observe(events, (id) => characters.get(id))
            },
        })
        expect(characters.has(f.actor.id)).toBe(false)
        expect(f.corpse()).toMatchObject({
            title: 'Тело: Павший',
            itemCount: 2,
        })
        f.world.openChestById(f.viewer, f.corpse().id, now + 60_000)
        expect(
            f.world.containers.snapshot(f.viewer, now + 60_000)
        ).toMatchObject({ gold: 37, items: [f.item, f.weapon] })
        f.takeAll()
        expect(f.viewer.inventory).toEqual([f.item, f.weapon])
        expect(f.wallet.snapshot(f.viewer.id).gold).toBe(37)
        expect(f.wallet.snapshot(f.actor.id).gold).toBe(0)
        expect(
            f.world.snapshotChests().filter((entry) => entry.kind === 'corpse')
        ).toEqual([])
        expect(f.world.finalizeDeath(f.actor, now + 60_001)).toEqual([])
    })

    it('revives with identity, equipment, money and bag intact and never creates loot', () => {
        const f = fixture()
        const caster = new GameCharacter({
            id: 'cleric',
            archetype: 'human',
            heroClass: 'cleric',
            controllerKind: 'network_player',
            faction: 'peaceful',
            nickname: 'cleric',
            spawnPosition: f.actor.position,
        })
        expect(
            beginRevive(caster, f.actor, now + 1_000, {
                characters: [caster, f.actor],
                navigation: f.navigation,
                now: now + 1_000,
            })
        ).toBe(true)
        advanceRevive(
            caster,
            () => f.actor,
            now + 4_000,
            () => 0
        )
        expect(f.actor.alive).toBe(true)
        expect(f.actor.inventory).toEqual([f.item])
        expect(f.actor.equipment.weapon).toBe(f.weapon)
        expect(f.wallet.snapshot(f.actor.id).gold).toBe(37)
        expect(f.world.finalizeDeath(f.actor, now + 60_000)).toEqual([])
        expect(
            f.world.snapshotChests().filter((entry) => entry.kind === 'corpse')
        ).toEqual([])
    })
})

describe('finite NPC possessions and shared corpse transfers', () => {
    it('moves the real equipment once, keeps corpse after respawn and does not replenish items', () => {
        const f = fixture(false)
        f.world.dropLootForDeaths(f.deaths, () => f.actor)
        expect(f.actor.inventory).toEqual([])
        expect(f.actor.equipment).toEqual({})
        expect(f.wallet.snapshot(f.actor.id).gold).toBe(0)
        expect(f.corpse().itemCount).toBe(2)
        f.actor.tickTimedState(now + 15_000)
        expect(f.actor.alive).toBe(true)
        expect(f.actor.equipment).toEqual({})
        expect(f.world.dropLootForDeaths(f.deaths, () => f.actor)).toEqual([])
        f.actor.applyDamage(f.actor.hp, now + 16_000)
        f.world.dropLootForDeaths(f.deaths, () => f.actor)
        expect(
            f.world.snapshotChests().filter((item) => item.kind === 'corpse')
        ).toHaveLength(1)
    })

    it('shares items once across viewers, keeps overflow and transfers gold even with a full bag', () => {
        const f = fixture(false)
        f.world.dropLootForDeaths(f.deaths, () => f.actor)
        const other = chestHero('other', f.viewer.position)
        f.world.openChestById(f.viewer, f.corpse().id, now)
        f.world.openChestById(other, f.corpse().id, now)
        f.viewer.inventory = Array.from({ length: INVENTORY_CAPACITY }, () =>
            createItemInstance('food')
        )
        f.takeAll()
        expect(f.wallet.snapshot(f.viewer.id).gold).toBe(37)
        expect(f.corpse().itemCount).toBe(2)
        f.takeAll()
        expect(f.wallet.snapshot(f.viewer.id).gold).toBe(37)
        f.world.containers.handle(
            other,
            {
                type: 'take_chest_item',
                chestId: f.corpse().id,
                itemInstanceId: f.weapon.instanceId,
            },
            now
        )
        f.world.containers.handle(
            f.viewer,
            {
                type: 'take_chest_item',
                chestId: f.corpse().id,
                itemInstanceId: f.weapon.instanceId,
            },
            now
        )
        expect(other.inventory).toEqual([f.weapon])
        expect(f.corpse().itemCount).toBe(1)
        const food = f.viewer.inventory[0]
        if (food === undefined) {
            throw new Error('Expected food')
        }
        f.world.containers.handle(
            f.viewer,
            {
                type: 'put_chest_item',
                chestId: f.corpse().id,
                itemInstanceId: food.instanceId,
            },
            now
        )
        expect(f.viewer.inventory).toContain(food)
        expect(f.corpse().itemCount).toBe(1)
    })

    it('revalidates private gold access after leaving reach and does not expose contents publicly', () => {
        const f = fixture(false)
        const events = f.world.dropLootForDeaths(f.deaths, () => f.actor)
        expect(events).toEqual([
            { kind: 'item_drop', targetId: f.actor.id, chestId: f.corpse().id },
        ])
        expect(f.corpse()).not.toHaveProperty('gold')
        expect(f.corpse()).not.toHaveProperty('items')
        f.world.openChestById(f.viewer, f.corpse().id, now)
        f.viewer.position.x += 100
        f.world.containers.handle(
            f.viewer,
            { type: 'take_chest_gold', chestId: f.corpse().id },
            now
        )
        expect(f.wallet.snapshot(f.viewer.id).gold).toBe(0)
        expect(f.world.containers.snapshot(f.viewer, now)).toBeNull()
        f.viewer.position = { ...f.actor.position }
        f.world.containers.handle(
            f.viewer,
            { type: 'take_chest_gold', chestId: f.corpse().id },
            now
        )
        expect(f.wallet.snapshot(f.viewer.id).gold).toBe(0)
    })
})

describe('shared corpse currency command boundary', () => {
    it('accepts a validated container id for both player and agent commands', () => {
        const command = { type: 'take_chest_gold', chestId: 'corpse:fallen:1' }
        expect(parseClientMessage(JSON.stringify(command)).message).toEqual(
            command
        )
        expect(parseAgentDecision(command)).toEqual(command)
        expect(parseAgentDecision({ ...command, chestId: '' })).toBeUndefined()
    })
})

describe('corpse integration with automatic controls and prayer context', () => {
    it('opening a corpse stops follow without depending on a client stop command', () => {
        const f = fixture(false)
        f.world.dropLootForDeaths(f.deaths, () => f.actor)
        const friend = chestHero('friend', { x: 130, y: 100 })
        expect(
            setCharacterControl(
                f.viewer,
                { type: 'follow', targetId: friend.id },
                {
                    getCharacter: () => friend,
                    navigationFor: () => chestNavigation(),
                    requestAttack: () => undefined,
                },
                now
            )
        ).toBe(true)
        f.world.openChestById(f.viewer, f.corpse().id, now)
        expect(snapshotControl(f.viewer)).toEqual({
            mode: 'none',
            targetId: null,
        })
    })

    it('finishes revival through the full location context and interrupts if sight is lost', () => {
        const f = fixture()
        const caster = new GameCharacter({
            id: 'caster',
            archetype: 'human',
            heroClass: 'cleric',
            controllerKind: 'network_player',
            faction: 'peaceful',
            nickname: 'Caster',
            spawnPosition: f.actor.position,
        })
        const navigation = chestNavigation()
        const characters = new Map([
            [f.actor.id, f.actor],
            [caster.id, caster],
        ])
        const context = {
            characters: [...characters.values()],
            navigation,
            now: now + 1_000,
            random: () => 0,
        }
        expect(beginRevive(caster, f.actor, context.now, context)).toBe(true)
        const sight = vi
            .spyOn(navigation, 'hasLineOfSight')
            .mockReturnValue(false)
        const publish = vi.fn()
        try {
            advanceRoomLives({
                characters,
                connections: new Map(),
                controllers: new Map(),
                nicknames: new Map(),
                now: now + 4_000,
                abilityContextFor: (_actor, at) => ({ ...context, now: at }),
                beforeRetire: (actor, at) => {
                    f.world.finalizeDeath(actor, at)
                },
                onEvents: publish,
            })
            expect(caster.abilities.casting).toBeNull()
            expect(f.actor.alive).toBe(false)
            expect(f.actor.inventory).toEqual([f.item])
            expect(publish).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        kind: 'cast',
                        phase: 'interrupted',
                    }),
                ])
            )
            expect(
                f.world
                    .snapshotChests()
                    .some((entry) => entry.kind === 'corpse')
            ).toBe(false)
        } finally {
            sight.mockRestore()
        }
    })
})
