import { describe, expect, it } from 'vitest'

import { resolveCharacterDamage } from '../src/game/abilityDamage'
import type { PendingAttackHit } from '../src/game/characterState'
import { attemptAttack, resolvePendingAttackHit } from '../src/game/combat'
import { resolveAttackDamage } from '../src/game/combatDamage'
import { combatHitQuality } from '../src/game/combatHitQuality'
import { createItemInstance } from '../src/game/inventory'
import { abilityHero } from './abilityTestHelpers'
import { bladeDuel } from './bladeCombatFixture'
import { trainingCombatFixture } from './trainingCombatFixture'

describe('authoritative hit quality', () => {
    it.each([
        [0, 'weak'],
        [1, 'weak'],
        [2, 'weak'],
        [3, 'normal'],
        [5, 'normal'],
        [6, 'strong'],
        [9, 'strong'],
    ] as const)(
        'classifies roll %s before final damage modifiers',
        (roll, quality) => {
            expect(combatHitQuality(roll, 0, 9, false, false)).toBe(quality)
        }
    )

    it('prioritizes a critical over low energy, then low energy over roll quality', () => {
        expect(combatHitQuality(9, 0, 9, true, true)).toBe('critical')
        expect(combatHitQuality(9, 0, 9, false, true)).toBe('weak')
        expect(combatHitQuality(7, 7, 7, false, false)).toBe('normal')
        expect(combatHitQuality(7, 7, 7, false, true)).toBe('weak')
    })

    it('does not infer energy shortage from an unrelated final damage multiplier', () => {
        const actor = abilityHero('cleric')
        actor.equipment.weapon = createItemInstance('simple_sword')
        const attack: PendingAttackHit = {
            canStun: false,
            damageMultiplier: 0.5,
            hitAt: 1000,
            targetEnergyDrain: 0,
        }
        expect(resolveAttackDamage(actor, attack, () => 0.5)).toMatchObject({
            amount: 5,
            hitQuality: 'normal',
        })
        expect(
            resolveAttackDamage(
                actor,
                { ...attack, underpowered: true },
                () => 0.5
            )
        ).toMatchObject({ amount: 5, hitQuality: 'weak' })
    })

    it('keeps raw-roll quality independent from lethal HP clipping and barrier absorption', () => {
        const actor = abilityHero('cleric')
        actor.config.combat.damageMultiplier = 1
        actor.equipment.weapon = createItemInstance('simple_sword')
        const attack: PendingAttackHit = {
            canStun: false,
            damageMultiplier: 1,
            hitAt: 1000,
            targetEnergyDrain: 0,
        }
        let index = 0
        const random = () => [0.99, 0.9][index++] ?? 0.9
        const roll = resolveAttackDamage(actor, attack, random)
        expect(roll).toEqual({
            amount: 11,
            critical: false,
            hitQuality: 'strong',
        })
        const target = abilityHero('vanguard', 'undead')
        Object.assign(target, { faction: 'monsters', hp: 1 })
        target.mana = 3
        target.abilities.barrier = {
            expiresAt: 2000,
            practiced: false,
        }
        const result = resolveCharacterDamage({
            actor,
            target,
            amount: roll.amount,
            hitQuality: roll.hitQuality,
            now: 1000,
            damageKind: 'physical',
            respawnDelayMs: 15000,
        })
        expect(result.events).toContainEqual(
            expect.objectContaining({
                kind: 'absorb',
                amount: 3,
                hitQuality: 'strong',
            })
        )
        expect(result.events).toContainEqual(
            expect.objectContaining({
                kind: 'damage',
                amount: 1,
                hitQuality: 'strong',
            })
        )
    })
})

describe('resolved hit and miss quality', () => {
    it('emits one miss for a completed empty swing, and none for a rejected command', () => {
        const f = trainingCombatFixture()
        f.dummy.position.y = 300
        expect(f.start()).toEqual([])
        expect(f.hit()).toEqual([])
        const context = { ...f.attack(), targets: [], targetId: undefined }
        expect(attemptAttack(context)).toHaveLength(1)
        expect(resolvePendingAttackHit({ ...context, now: 1050 })).toEqual([
            expect.objectContaining({
                kind: 'miss',
                actorId: f.actor.id,
                hitQuality: 'miss',
                attackOrigin: 'basic',
            }),
        ])
        expect(resolvePendingAttackHit({ ...context, now: 1051 })).toEqual([])
    })

    it('marks an ordinary dodge as a miss without cost-free damage or weapon wear', () => {
        const f = bladeDuel()
        f.actor.equipment.weapon = createItemInstance('simple_sword')
        const durability = f.actor.equipment.weapon.durability
        f.target.config.combat.dodgeChance = 1
        expect(attemptAttack(f.attack)).toHaveLength(1)
        const events = resolvePendingAttackHit({
            ...f.at(1050),
            random: () => 0,
        })
        expect(events).toEqual([
            expect.objectContaining({ kind: 'miss', hitQuality: 'miss' }),
        ])
        expect(f.target.hp).toBe(1000)
        expect(f.target.energy).toBe(95)
        expect(f.actor.equipment.weapon.durability).toBe(durability)
    })
})
