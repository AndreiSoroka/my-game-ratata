import { describe, expect, it } from 'vitest'

import { resolveCharacterDamage } from '../src/game/abilityDamage'
import { resolveCharacterStats } from '../src/game/characterStats'
import { attemptAttack, resolvePendingAttackHit } from '../src/game/combat'
import { createItemInstance } from '../src/game/inventory'
import { hasEquippedSword } from '../src/game/skillProgression'
import { WorldInventory } from '../src/game/worldInventory'
import { abilityContext, abilityHero } from './abilityTestHelpers'

describe('shared combat equipment wear', () => {
    it.each(['network_player', 'scripted'] as const)(
        'wears the used sword once on a successful hit for %s',
        (controller) => {
            const setup = encounter(controller)
            const { actor, target, sword, attack, boots } = setup
            sword.durability = 1
            expect(attemptAttack(attack)).toHaveLength(1)
            expect(sword.durability).toBe(1)
            const events = resolvePendingAttackHit({ ...attack, now: 1100 })
            expect(events.some((event) => event.kind === 'damage')).toBe(true)
            expect(events.some((event) => event.kind === 'notice')).toBe(true)
            expect(sword.durability).toBe(0)
            expect(boots.durability).toBe(999)
            expect(hasEquippedSword(actor)).toBe(false)
            expect(resolvePendingAttackHit({ ...attack, now: 1101 })).toEqual(
                []
            )
            expect(boots.durability).toBe(999)
            const hp = target.hp
            const energy = actor.energy
            expect(attemptAttack({ ...attack, now: 2000 })).toEqual([])
            expect(actor.energy).toBe(energy)
            expect(target.hp).toBe(hp)
            expect(
                new WorldInventory(attack.navigation).unequip(
                    actor,
                    'weapon',
                    2000
                )
            ).toHaveLength(1)
            expect(attemptAttack({ ...attack, now: 2000 })).toHaveLength(1)
        }
    )

    it('does not wear equipment on rejected or missed attacks', () => {
        const { actor, target, sword, boots, attack } = encounter()
        target.position.y = 300
        expect(attemptAttack(attack)).toEqual([])
        target.position.y = 112
        expect(attemptAttack(attack)).toHaveLength(1)
        expect(
            resolvePendingAttackHit({
                ...attack,
                now: 1100,
                random: () => 0,
            })[0]?.kind
        ).toBe('miss')
        expect(sword.durability).toBe(200)
        expect(boots.durability).toBe(1000)
        expect(actor.alive).toBe(true)
    })

    it('rejects swapping or unequipping an attacking weapon during windup', () => {
        const { actor, sword, attack } = encounter()
        attemptAttack(attack)
        const inventory = new WorldInventory(attack.navigation)
        expect(inventory.unequip(actor, 'weapon', 1020)).toEqual([])
        expect(actor.equipment.weapon).toBe(sword)
        // Even a different internal controller cannot substitute an instance mid-hit.
        actor.equipment.weapon = createItemInstance('simple_sword')
        expect(resolvePendingAttackHit({ ...attack, now: 1100 })).toEqual([])
        expect(sword.durability).toBe(200)
        expect(actor.equipment.weapon.durability).toBe(200)
    })
})

describe('clothing damage and death loot', () => {
    it('wears clothes only on actual HP damage, including magic and fatal hits', () => {
        const { actor, target, boots } = encounter()
        target.mana = 20
        target.abilities.barrier = {
            expiresAt: 5000,
            practiced: false,
        }
        const input = {
            actor,
            target,
            amount: 10,
            now: 1000,
            damageKind: 'arcane' as const,
            respawnDelayMs: 15000,
        }
        expect(resolveCharacterDamage(input).hpDamage).toBe(0)
        expect(boots.durability).toBe(1000)
        target.hp = 2
        expect(resolveCharacterDamage({ ...input, amount: 15 }).hpDamage).toBe(
            2
        )
        expect(boots.durability).toBe(999)
        expect(target.alive).toBe(false)
        expect(resolveCharacterDamage(input).hpDamage).toBe(0)
        expect(boots.durability).toBe(999)
    })

    it('excludes broken clothing bonuses without affecting unbroken equipment', () => {
        const { target, boots } = encounter()
        const base = target.config.combat.dodgeChance
        expect(
            resolveCharacterStats(target.config, target.equipment).dodgeChance
        ).toBeCloseTo(base + 0.08)
        boots.durability = 0
        expect(
            resolveCharacterStats(target.config, target.equipment).dodgeChance
        ).toBe(base)
    })

    it('keeps worn instances when death transfers them into a corpse', () => {
        const { actor, target, boots, attack } = encounter()
        boots.durability = 60
        boots.wearDistance = 123
        const input = {
            actor,
            target,
            amount: 100,
            now: 1000,
            damageKind: 'physical' as const,
            respawnDelayMs: 15000,
        }
        const events = resolveCharacterDamage(input).events
        const inventory = new WorldInventory(attack.navigation)
        inventory.dropLootForDeaths(events, (id) =>
            id === target.id ? target : actor
        )
        const corpse = inventory
            .snapshotChests()
            .find((chest) => chest.kind === 'corpse')
        expect(corpse).toBeDefined()
        if (corpse === undefined) {
            throw new Error('Expected a corpse')
        }
        actor.position = { ...target.position }
        inventory.openChestById(actor, corpse.id, 1000)
        inventory.containers.handle(
            actor,
            { type: 'take_all_chest_items', chestId: corpse.id },
            1000
        )
        expect(
            actor.inventory.find((item) => item.instanceId === boots.instanceId)
        ).toMatchObject({ durability: 59, wearDistance: 123 })
    })
})

function encounter(
    controller: 'network_player' | 'scripted' = 'network_player'
) {
    const actor = abilityHero('cleric', 'humanoid', controller)
    const target = abilityHero('vanguard', 'undead', 'scripted')
    Object.assign(target, { faction: 'monsters', position: { x: 100, y: 112 } })
    const sword = createItemInstance('simple_sword')
    const boots = createItemInstance('boots')
    actor.equipment.weapon = sword
    target.equipment.boots = boots
    const { navigation } = abilityContext([actor, target])
    return {
        actor,
        target,
        sword,
        boots,
        attack: {
            actor,
            targets: [target],
            now: 1000,
            tileSize: 16,
            navigation,
            respawnDelayMsFor: () => 15000,
            random: () => 0.5,
            targetId: target.id,
        },
    }
}
