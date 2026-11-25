import {
    resolveStealthTheftBonuses,
    resolveTheftChances,
} from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { criticalChance } from '../../frontend/src/pages/constellation-debug/model/constellationChanceMath'
import type { PendingAttackHit } from '../src/game/characterState'
import { resolveAttackDamage } from '../src/game/combatDamage'
import { defendContact } from '../src/game/combatDefense'
import {
    consumeRunicShot,
    recordRunicContact,
} from '../src/game/constellations'
import { createItemInstance } from '../src/game/inventory'
import { castSpell } from '../src/game/spellCasting'
import {
    abilityContext,
    abilityHero,
    resolveTestSpells,
} from './abilityTestHelpers'
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

    it('keeps learned melee dodge and parry separate and ignores broken weapon or armor bonuses', () => {
        const actor = abilityHero('vanguard')
        const attacker = abilityHero('cleric')
        actor.config.combat.dodgeChance = 0.05
        actor.equipment.boots = createItemInstance('boots')
        actor.equipment.weapon = createItemInstance('old_sword')
        actor.progression.constellations.opened.add('blade.dodge')
        const probe = (sample: number) => {
            actor.energy = 100
            return defendContact(
                attacker,
                actor,
                { ...pending, delivery: 'melee_physical' },
                1000,
                () => sample
            )
        }
        const dodge = 0.05 + 0.08 + 0.05
        const parry = 0.1
        expect(probe(dodge - 1e-8).outcome).toBe('dodge')
        expect(actor.energy).toBe(95)
        expect(probe(dodge).outcome).toBe('parry')
        expect(actor.energy).toBe(95)
        expect(probe(dodge + parry - 1e-8).outcome).toBe('parry')
        expect(probe(dodge + parry).outcome).toBe('hit')
        expect(actor.energy).toBe(100)
        actor.equipment.weapon.durability = 0
        expect(probe(0.05 + 0.08 - 1e-8).outcome).toBe('dodge')
        expect(probe(0.05 + 0.08).outcome).toBe('hit')
        actor.equipment.boots.durability = 0
        expect(probe(0.05).outcome).toBe('hit')
    })
})

describe('debug skill effect examples agree with authoritative rules', () => {
    it.each([
        { front: false, stars: [], overall: 0.35 },
        { front: true, stars: [], overall: 0.16 },
        {
            front: false,
            stars: [
                'theft.luck1',
                'theft.luck2',
                'theft.luck3',
                'theft.composure1',
                'theft.composure2',
                'theft.composure3',
            ],
            overall: 0.4395090909,
        },
        {
            front: true,
            stars: [
                'theft.luck1',
                'theft.luck2',
                'theft.luck3',
                'theft.composure1',
                'theft.composure2',
                'theft.composure3',
            ],
            overall: 0.224,
        },
    ] as const)(
        'matches real detection and item rolls (front or side: $front, overall: $overall)',
        ({ front, stars, overall }) => {
            const chance = resolveTheftChances(
                front,
                resolveStealthTheftBonuses(new Set(stars))
            )
            expect(chance.unnoticed).toBeCloseTo(overall)
            expect(
                theftOutcome(front, stars, [chance.detected - 1e-8, 0])
            ).toBe('caught')
            expect(
                theftOutcome(front, stars, [
                    chance.detected,
                    chance.success - 1e-8,
                ])
            ).toBe('stolen')
            expect(
                theftOutcome(front, stars, [chance.detected, chance.success])
            ).toBe('failed')
        }
    )

    it.each(['fireball', 'greater_fireball'] as const)(
        'does not dodge or critically multiply a %s blast',
        (skillId) => {
            const actor = abilityHero('arcanist')
            const target = abilityHero('vanguard')
            actor.config.combat.critChance = 0.95
            actor.abilities.known.add(skillId)
            actor.progression.masteries.magic.level = 100
            actor.progression.constellations.opened.add('magic.fire_damage')
            target.config.combat.dodgeChance = 0.95
            Object.assign(target, {
                faction: 'monsters',
                hp: 200,
                maxHp: 200,
                position: { x: 100, y: 220 },
            })
            const base = skillId === 'fireball' ? 10 : 50
            const context = abilityContext([actor, target], 1000, () => 0)
            castSpell(
                actor,
                { type: 'cast_spell', skillId, targetId: target.id },
                context
            )
            const events = resolveTestSpells(actor, context)
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
    front: boolean,
    stars: readonly string[],
    rolls: number[]
) {
    const fixture = theftFixture()
    fixture.victim.facing = front ? 'left' : 'right'
    for (const star of stars) {
        fixture.actor.progression.constellations.opened.add(star)
    }
    fixture.attempt(rolls)
    return fixture.service.snapshot(fixture.actor.id, fixture.actor.id, 1000)
        .lastResult?.outcome
}
