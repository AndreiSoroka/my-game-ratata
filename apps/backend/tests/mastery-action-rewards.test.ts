import {
    type ConstellationId,
    constellationIds,
    MASTERY_REWARDS,
    masteryRewardMicros,
    masteryTotalExperience,
    parseMasteryExperience,
} from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { resolveCharacterDamage } from '../src/game/abilityDamage'
import {
    attemptAbilityAttack,
    attemptAttack,
    resolvePendingAttackHit,
} from '../src/game/combat'
import { constellationStars } from '../src/game/constellationCatalog'
import { finishConstellationAction } from '../src/game/constellations'
import {
    effectiveAbility,
    effectiveCharacterStats,
} from '../src/game/effectiveParameters'
import { createItemInstance } from '../src/game/inventory'
import {
    learnFireball,
    studyMagic,
    teachMagic,
} from '../src/game/magicLearning'
import { captureMasteryFactors } from '../src/game/skillProgression'
import { castSpell } from '../src/game/spellCasting'
import {
    recordVitalityDamage,
    recordVitalityRecovery,
} from '../src/game/vitalityPractice'
import {
    abilityContext,
    abilityHero,
    resolveTestSpells,
} from './abilityTestHelpers'

function encounter(
    kind: 'network_player' | 'scripted' | 'mob1' = 'network_player',
    heroClass: 'arcanist' | 'vanguard' = 'arcanist'
) {
    const actor = abilityHero(heroClass, 'humanoid', kind)
    const target = abilityHero('vanguard', 'undead')
    target.reputation.peaceful = -100
    Object.assign(target, { faction: 'monsters', position: { x: 100, y: 132 } })
    const context = abilityContext([actor, target], 1000, () => 0.5)
    const attack = {
        actor,
        targets: context.characters,
        now: 1000,
        tileSize: 16,
        navigation: context.navigation,
        respawnDelayMsFor: () => 15000,
        random: () => 0.5,
        targetId: target.id,
    }
    return { actor, target, context, attack }
}
function total(
    actor: ReturnType<typeof abilityHero>,
    path: ConstellationId
): bigint {
    const mastery = actor.progression.masteries[path]
    return masteryTotalExperience(mastery.level) + mastery.experience
}

describe('meaningful non-prayer mastery awards', () => {
    it.each(['network_player', 'scripted', 'mob1'] as const)(
        'awards a useful Spark hit once for %s through the same combat resolver',
        (kind) => {
            const { actor, attack } = encounter(kind)
            attemptAbilityAttack(attack, 'spark')
            resolvePendingAttackHit({ ...attack, now: 1200 })
            expect(total(actor, 'magic')).toBe(parseMasteryExperience('30'))
            resolvePendingAttackHit({ ...attack, now: 1201 })
            expect(total(actor, 'magic')).toBe(parseMasteryExperience('30'))
        }
    )
})

describe('practice evidence keeps discovery weights', () => {
    it('retains relevant practice weights without awarding Spark XP twice', () => {
        const { actor, attack } = encounter()
        attemptAbilityAttack(attack, 'spark')
        resolvePendingAttackHit({ ...attack, now: 1200 })
        expect(total(actor, 'magic')).toBe(parseMasteryExperience('30'))
        expect(actor.progression.constellations.evidence['arcana']).toBe(1)
        const neutral = abilityHero('arcanist')
        for (const candidate of [actor, neutral]) {
            candidate.progression.masteries.magic.level = 1
            candidate.progression.constellations.credits.magic = 1
            finishConstellationAction(candidate, {
                constellationIds: ['magic'],
                now: 2000,
                random: () => 0.6,
            })
        }
        expect(
            actor.progression.constellations.opened.has('magic.spark_economy')
        ).toBe(true)
        expect(
            neutral.progression.constellations.opened.has(
                'magic.barrier_strength'
            )
        ).toBe(true)
    })
})

describe('weapon and spell mastery rewards', () => {
    it.each([
        ['blade', 18],
        ['arrow', 20],
    ] as const)('awards %s only for a real paid hit', (path, reward) => {
        const { actor, target, attack } = encounter(
            'network_player',
            path === 'blade' ? 'vanguard' : 'arcanist'
        )
        if (path === 'blade') {
            target.position.y = 114
            actor.equipment.weapon = createItemInstance('simple_sword')
            expect(attemptAttack({ ...attack, now: 2000 })).toHaveLength(1)
        } else {
            actor.abilities.known.add('shot')
            attemptAbilityAttack(attack, 'shot')
        }
        resolvePendingAttackHit({ ...attack, now: 3000 })
        expect(total(actor, path)).toBe(parseMasteryExperience(String(reward)))
    })
    it.each([
        ['fireball', 48],
        ['greater_fireball', 84],
    ] as const)(
        'awards %s mastery from useful hostile damage',
        (id, reward) => {
            const { actor, target, context } = encounter()
            actor.abilities.known.add(id)
            target.position.y = 210
            castSpell(
                actor,
                { type: 'cast_spell', skillId: id, targetId: target.id },
                context
            )
            resolveTestSpells(actor, context)
            expect(total(actor, 'magic')).toBe(
                parseMasteryExperience(String(reward))
            )
            const before = total(actor, 'magic')
            castSpell(
                actor,
                { type: 'cast_spell', skillId: id, targetId: target.id },
                context
            )
            expect(total(actor, 'magic')).toBe(before)
        }
    )
    it('freezes defender factors before a first Barrier award and a Life award in the same hit', () => {
        const { actor, target } = encounter()
        const startingExperience = parseMasteryExperience('99.9')
        target.progression.masteries.magic.experience = startingExperience
        target.progression.masteries.life.experience = startingExperience
        const factors = captureMasteryFactors(target)
        const barrierExperience = masteryRewardMicros(
            MASTERY_REWARDS.barrierAbsorb,
            factors.magic
        )
        const woundExperience = masteryRewardMicros(
            MASTERY_REWARDS.vitalityBlock,
            factors.life
        )
        target.mana = 1
        target.abilities.barrier = {
            expiresAt: 5000,
            practiced: false,
        }
        const result = resolveCharacterDamage({
            actor,
            target,
            amount: target.maxHp * 0.2 + 1,
            now: 1000,
            damageKind: 'physical',
            respawnDelayMs: 15000,
        })
        expect(result.absorbed).toBe(1)
        expect(target.progression.masteries.magic.level).toBe(1)
        expect(target.progression.masteries.life.level).toBe(1)
        expect(total(target, 'magic')).toBe(
            startingExperience + barrierExperience
        )
        expect(total(target, 'life')).toBe(startingExperience + woundExperience)
    })
    it('rewards a Barrier once per application and preserves hostile resource provenance', () => {
        const { actor, target } = encounter()
        const barrierExperience = masteryRewardMicros(
            MASTERY_REWARDS.barrierAbsorb,
            captureMasteryFactors(target).magic
        )
        target.mana = 8
        target.abilities.barrier = {
            expiresAt: 5000,
            practiced: false,
        }
        for (const now of [1000, 1100]) {
            resolveCharacterDamage({
                actor,
                target,
                amount: 3,
                now,
                damageKind: 'physical',
                respawnDelayMs: 15000,
            })
        }
        expect(total(target, 'magic')).toBe(barrierExperience)
        expect(total(target, 'life')).toBe(0n)
    })
})

describe('mastery rewards preserve action boundaries', () => {
    it('uses complete 20% wound/recovery blocks without an extra low-HP XP bonus', () => {
        const { actor } = encounter()
        const block = actor.maxHp * 0.2
        actor.hp = actor.maxHp * 0.19
        recordVitalityDamage(actor, block, 1000)
        expect(total(actor, 'life')).toBe(parseMasteryExperience('20'))
        expect(actor.progression.constellations.lowHpFromHostile).toBe(true)
        const factors = captureMasteryFactors(actor)
        actor.progression.masteries.magic.level = 10
        actor.hp += block
        recordVitalityRecovery(actor, block, 1100, false, factors)
        expect(total(actor, 'life')).toBe(parseMasteryExperience('40'))
        recordVitalityRecovery(actor, block, 1200)
        expect(total(actor, 'life')).toBe(parseMasteryExperience('40'))
    })
    it('applies conflict to XP while preserving fixed spell and sword power', () => {
        const { actor, target, context } = encounter()
        actor.equipment.weapon = createItemInstance('simple_sword')
        actor.abilities.known.add('fireball')
        const before = {
            stats: effectiveCharacterStats(actor),
            spell: effectiveAbility(actor, 'fireball'),
        }
        for (const path of constellationIds) {
            actor.progression.masteries[path].level = path === 'magic' ? 2 : 10
        }
        expect(effectiveCharacterStats(actor)).toEqual(before.stats)
        expect(effectiveAbility(actor, 'fireball')).toEqual(before.spell)
        const factors = captureMasteryFactors(actor)
        target.position.y = 210
        castSpell(
            actor,
            { type: 'cast_spell', skillId: 'fireball', targetId: target.id },
            context
        )
        resolveTestSpells(actor, context)
        expect(actor.progression.masteries.magic.experience).toBe(
            masteryRewardMicros(48, factors.magic)
        )
    })
})

describe('new knowledge rewards', () => {
    it('pays a teacher only for a newly learned spell and checks Magic three', () => {
        const student = abilityHero('arcanist')
        const teacher = abilityHero('arcanist')
        teacher.tags.add('scholar')
        teacher.abilities.known.add('fireball')
        student.progression.masteries.magic.level = 2
        expect(learnFireball(student, teacher, 1000)).toEqual([])
        expect(total(teacher, 'magic')).toBe(0n)
        student.progression.masteries.magic.level = 3
        learnFireball(student, teacher, 1100)
        expect(student.abilities.known.has('fireball')).toBe(true)
        expect(total(teacher, 'magic')).toBe(parseMasteryExperience('60'))
        expect(student.progression.masteries.magic.experience).toBe(0n)
        expect(learnFireball(student, teacher, 1200)).toEqual([])
        expect(total(teacher, 'magic')).toBe(parseMasteryExperience('60'))
    })
    it('releases a banked Magic opening immediately when newly learned Fireball fulfils its last condition', () => {
        const student = abilityHero('arcanist')
        const teacher = abilityHero('arcanist')
        teacher.tags.add('scholar')
        student.progression.masteries.magic.level = 3
        student.progression.constellations.credits.magic = 1
        for (const node of constellationStars.filter(
            (node) =>
                node.constellationId === 'magic' &&
                node.id !== 'magic.fire_damage'
        )) {
            student.progression.constellations.opened.add(node.id)
        }
        learnFireball(student, teacher, 1000)
        expect(
            student.progression.constellations.opened.has('magic.fire_damage')
        ).toBe(true)
        expect(student.progression.constellations.credits.magic).toBe(0)
        expect(student.progression.masteries.magic.experience).toBe(0n)
        expect(total(teacher, 'magic')).toBe(parseMasteryExperience('60'))
    })
    it('pays a player teacher once and preserves free knowledge for the student', () => {
        const teacher = abilityHero('arcanist')
        const student = abilityHero('vanguard')
        teacher.abilities.known.add('fireball')
        student.progression.masteries.magic.level = 3
        teachMagic(teacher, student, 1000)
        expect(total(teacher, 'magic')).toBe(parseMasteryExperience('60'))
        expect(student.progression.masteries.magic.experience).toBe(0n)
        expect(teachMagic(teacher, student, 1100)).toEqual([])
        expect(total(teacher, 'magic')).toBe(parseMasteryExperience('60'))
    })
    it('pays only the three real new chapters', () => {
        const student = abilityHero('arcanist')
        const teacher = abilityHero('arcanist')
        teacher.tags.add('scholar')
        for (const now of [1000, 1100, 1200]) {
            studyMagic(student, teacher, now)
        }
        expect(total(student, 'magic')).toBe(parseMasteryExperience('180'))
        expect(studyMagic(student, teacher, 1300)).toEqual([])
        expect(total(student, 'magic')).toBe(parseMasteryExperience('180'))
    })
})
