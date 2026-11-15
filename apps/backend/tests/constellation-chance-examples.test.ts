import { describe, expect, it } from 'vitest'

import {
    criticalChance,
    swordDodgeChance,
    theftEffectChances,
} from '../../frontend/src/game/debug/constellationChanceMath'
import type { PendingAttackHit } from '../src/game/characterState'
import { dodgedAttack, resolveAttackDamage } from '../src/game/combatDamage'
import {
    consumeRunicShot,
    recordRunicContact,
} from '../src/game/constellations'
import { createItemInstance } from '../src/game/inventory'
import { castSpell } from '../src/game/spellCasting'
import { abilityContext, abilityHero } from './abilityTestHelpers'
import { theftFixture } from './theftFixtures'

const pending: PendingAttackHit = {
    hitAt: 1000,
    canStun: false,
    damageMultiplier: 1,
    targetEnergyDrain: 0,
}

describe('debug chance examples agree with authoritative rules', () => {
    it('uses strict capped critical thresholds and never adds sword critical to Shot or Spark', () => {
        const actor = abilityHero('vanguard')
        actor.config.combat.critChance = 0.94
        actor.equipment.weapon = createItemInstance('old_sword')
        actor.progression.constellations.opened.add('blade.critical')
        const threshold = criticalChance(0.94, 0.03)
        expect(criticalRoll(actor, pending, threshold - 1e-8)).toBe(true)
        expect(criticalRoll(actor, pending, threshold)).toBe(false)
        actor.config.combat.critChance = 0.05
        actor.progression.constellations.opened.add('arrow.critical')
        expect(
            criticalRoll(actor, { ...pending, abilityId: 'shot' }, 0.079)
        ).toBe(true)
        expect(
            criticalRoll(actor, { ...pending, abilityId: 'shot' }, 0.08)
        ).toBe(false)
        expect(
            criticalRoll(actor, { ...pending, abilityId: 'spark' }, 0.05)
        ).toBe(false)
        actor.equipment.weapon.durability = 0
        expect(criticalRoll(actor, pending, 0.05)).toBe(false)
    })

    it('includes only sound equipment and a sound sword in the actual dodge probability', () => {
        const actor = abilityHero('vanguard')
        actor.config.combat.dodgeChance = 0.05
        actor.equipment.boots = createItemInstance('boots')
        actor.equipment.weapon = createItemInstance('old_sword')
        actor.progression.constellations.opened.add('blade.dodge')
        const threshold = swordDodgeChance(0.05, 0.08, true)
        expect(dodgedAttack(actor, () => threshold - 1e-8)).toBe(true)
        expect(dodgedAttack(actor, () => threshold)).toBe(false)
        actor.equipment.weapon.durability = 0
        expect(
            dodgedAttack(actor, () => swordDodgeChance(0.05, 0.08, false))
        ).toBe(false)
        actor.equipment.boots.durability = 0
        expect(dodgedAttack(actor, () => 0.05)).toBe(false)
    })

    it.each([
        [1, 1, false, 0],
        [1, 1, true, 0],
        [1, 1, false, 0.03],
        [1, 1, false, 0.06],
        [10, 10, false, 0.06],
    ] as const)(
        'matches real detection and conditional item rolls for S=%s T=%s front=%s bonus=%s',
        (stealth, theft, front, bonus) => {
            const chance = theftEffectChances(stealth, theft, front, bonus)
            expect(
                theftOutcome(stealth, theft, front, bonus, [
                    chance.detected - 1e-8,
                    0,
                ])
            ).toBe('caught')
            expect(
                theftOutcome(stealth, theft, front, bonus, [
                    chance.detected,
                    chance.success - 1e-8,
                ])
            ).toBe('stolen')
            expect(
                theftOutcome(stealth, theft, front, bonus, [
                    chance.detected,
                    chance.success,
                ])
            ).toBe('failed')
        }
    )

    it.each(['fireball', 'greater_fireball'] as const)(
        'does not dodge or critically multiply a direct %s',
        (skillId) => {
            const actor = abilityHero('arcanist')
            const target = abilityHero('vanguard')
            actor.config.combat.critChance = 0.95
            actor.progression.skills[skillId].unlocked = true
            actor.progression.skills[skillId].level = 4
            actor.progression.constellations.opened.add('magic.fire_damage')
            target.config.combat.dodgeChance = 0.95
            Object.assign(target, {
                faction: 'monsters',
                hp: 200,
                maxHp: 200,
                position: { x: 100, y: 132 },
            })
            const base = skillId === 'fireball' ? 8 + 2 * 3 : 18 + 3 * 3
            const events = castSpell(
                actor,
                { type: 'cast_spell', skillId, targetId: target.id },
                abilityContext([actor, target], 1000, () => 0)
            )
            expect(events).toContainEqual(
                expect.objectContaining({
                    kind: 'damage',
                    amount: Math.round(base * 1.1),
                })
            )
            expect(events.some((event) => event.kind === 'miss')).toBe(false)
        }
    )

    it('uses the strict runic effect boundary and consumes its one charge before hit resolution', () => {
        const actor = abilityHero('arcanist')
        for (const id of [
            'magic.spark_damage',
            'arrow.damage1',
            'magic.runic_echo',
        ]) {
            actor.progression.constellations.opened.add(id)
        }
        recordRunicContact(actor, 'foe', 'spell', 1000)
        expect(consumeRunicShot(actor, 5999)).toBe(1.1)
        expect(consumeRunicShot(actor, 5999)).toBe(1)
        recordRunicContact(actor, 'foe', 'spell', 1000)
        expect(consumeRunicShot(actor, 6000)).toBe(1)
    })
})

function criticalRoll(
    actor: ReturnType<typeof abilityHero>,
    attack: PendingAttackHit,
    chanceRoll: number
): boolean {
    const values = [0.5, chanceRoll]
    return resolveAttackDamage(actor, attack, () => values.shift() ?? 0.99)
        .critical
}
function theftOutcome(
    stealth: number,
    theft: number,
    front: boolean,
    bonus: number,
    rolls: number[]
) {
    const fixture = theftFixture()
    fixture.actor.progression.skills.stealth.level = stealth
    fixture.actor.progression.skills.theft.level = theft
    fixture.victim.facing = front ? 'left' : 'right'
    if (bonus > 0) {
        fixture.actor.progression.constellations.opened.add('shadow.luck1')
    }
    if (bonus > 0.03) {
        fixture.actor.progression.constellations.opened.add('shadow.luck2')
    }
    fixture.attempt(rolls)
    return fixture.service.snapshot(fixture.actor.id, fixture.actor.id, 1000)
        .lastResult?.outcome
}
