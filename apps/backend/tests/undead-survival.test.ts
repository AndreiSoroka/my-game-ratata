import type { DamageKind } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { resolveCharacterDamage } from '../src/game/abilityDamage'
import { GameCharacter } from '../src/game/character'
import {
    characterEnergyRegenRate,
    regenerateCharacter,
    restoreCharacter,
} from '../src/game/characterRecovery'
import { effectiveMaxEnergy } from '../src/game/effectiveResources'
import { captureSkeletonInheritanceProfile } from '../src/game/skeletonProgression'
import { consumeHeldPain } from '../src/game/undeadSurvivalCombat'
import { rememberInheritedPath } from '../src/game/undeadSurvivalState'
import { abilityHero } from './abilityTestHelpers'

function skeleton(...stars: string[]) {
    const actor = new GameCharacter({
        id: 'skeleton:survival',
        nickname: 'Skeleton',
        archetype: 'skeleton',
        controllerKind: 'mob1',
        faction: 'monsters',
        spawnPosition: { x: 100, y: 100 },
        spawnedAt: 0,
    })
    for (const star of stars) {
        actor.progression.constellations.opened.add(`undead.${star}`)
    }
    return actor
}

function hit(
    actor: GameCharacter,
    target: GameCharacter,
    now: number,
    amount = target.hp,
    damageKind: DamageKind = 'physical'
) {
    return resolveCharacterDamage({
        actor,
        target,
        now,
        amount,
        damageKind,
        respawnDelayMs: 15_000,
        random: () => 0.99,
    })
}

describe('Undead survival in shared combat', () => {
    it('intercepts only a bounded part of a spike, holding the attacker for one refund', () => {
        const actor = skeleton('delayed_decay', 'held_pain')
        const attacker = abilityHero('vanguard')
        const other = abilityHero('ranger')
        expect(hit(attacker, actor, 1000, 30, 'arcane').hpDamage).toBe(18)
        expect(actor.energy).toBe(201)
        expect(hit(attacker, actor, 1001, 20).hpDamage).toBe(20)
        expect(actor.energy).toBe(201)
        consumeHeldPain(actor, other, 1200)
        expect(actor.energy).toBe(201)
        consumeHeldPain(actor, attacker, 1300)
        expect(actor.energy).toBe(209)
        consumeHeldPain(actor, attacker, 1400)
        expect(actor.energy).toBe(209)
    })

    it('charges one second collapse after a new victory, still allowing death', () => {
        const actor = skeleton('collapse', 'collapse2')
        const attacker = abilityHero('vanguard')
        const victim = abilityHero('ranger')
        const first = hit(attacker, actor, 1000, 80)
        expect(first.hpDamage).toBe(49)
        expect(first.events.some((event) => event.kind === 'death')).toBe(false)
        expect(actor.hp).toBe(1)
        expect(actor.energy).toBe(165)
        expect(actor.isActionLocked(1500)).toBe(true)
        expect(actor.isActionLocked(2000)).toBe(false)

        hit(actor, victim, 3000)
        actor.hp = 20
        expect(hit(attacker, actor, 3200, 90).hpDamage).toBe(19)
        expect(actor.energy).toBe(75)
        expect(actor.alive).toBe(true)
        restoreCharacter(victim, 4000, false)
        hit(actor, victim, 4200)
        actor.hp = 20
        expect(hit(attacker, actor, 4500, 90).events).toContainEqual(
            expect.objectContaining({ kind: 'death', targetId: actor.id })
        )
        expect(actor.alive).toBe(false)
    })

    it.each(['holy', 'unholy'] as const)(
        'lets lethal %s damage bypass both survival protections',
        (kind) => {
            const actor = skeleton('delayed_decay', 'collapse')
            expect(hit(abilityHero(), actor, 1000, 70, kind).hpDamage).toBe(50)
            expect(actor.alive).toBe(false)
            expect(actor.energy).toBe(225)
        }
    )

    it('collects the grave loan only under hostile pressure and prices the next physical hit', () => {
        const actor = skeleton('grave_loan')
        const attacker = abilityHero()
        actor.energy = 20
        expect(hit(attacker, actor, 1000, 5).hpDamage).toBe(5)
        expect(actor.energy).toBe(38)
        expect(hit(attacker, actor, 2500, 10).hpDamage).toBe(11)
        expect(actor.energy).toBe(38)
        expect(hit(attacker, actor, 3000, 10).hpDamage).toBe(10)
        expect(actor.energy).toBe(38)
    })
})

it('mends during real rest and recovers energy faster only below a quarter', () => {
    const actor = skeleton('empty_veins', 'reassembly')
    actor.hp = 10
    actor.energy = 40
    expect(characterEnergyRegenRate(actor, false, false)(1000, 1000)).toBe(7)
    for (let now = 1000; now <= 6000; now += 1000) {
        regenerateCharacter(actor, 1000, false, false, now)
    }
    expect(actor.hp).toBeCloseTo(12.7)
    expect(actor.energy).toBe(40)
    regenerateCharacter(actor, 1000, false, false, 7000)
    expect(actor.hp).toBeCloseTo(14.15)
    expect(actor.energy).toBe(38)
    regenerateCharacter(actor, 1000, true, false, 8000)
    regenerateCharacter(actor, 1000, false, false, 9000)
    expect(actor.energy).toBe(38)
    actor.energy = effectiveMaxEnergy(actor) * 0.25
    expect(characterEnergyRegenRate(actor, false, false)(10_000, 1000)).toBe(5)
})

it('feasts only on a new resolved victory, including at the mastery cap', () => {
    const actor = skeleton('grim_feast')
    const victim = abilityHero()
    actor.progression.masteries.undead.level = 40
    actor.hp = 20
    actor.energy = 2
    hit(actor, victim, 1000)
    expect(actor.hp).toBe(32)
    expect(actor.energy).toBe(32)
    restoreCharacter(victim, 3000, false)
    hit(actor, victim, 4000)
    expect(actor.hp).toBe(32)
    expect(actor.energy).toBe(32)
})

it('uses the fallen mastery in an imprint and rewards just one worthy victory', () => {
    const actor = skeleton('imprint', 'second_oath')
    const ancestor = abilityHero('vanguard')
    ancestor.progression.masteries.life.level = 4
    const legacy = captureSkeletonInheritanceProfile(ancestor)
    expect(legacy).toEqual({ mastery: 'life', level: 4 })
    if (legacy === undefined) {
        throw new Error('Expected a mastery path from the ancestor')
    }
    const originalMaxHp = actor.maxHp
    rememberInheritedPath(actor, legacy.mastery)
    expect(actor.maxHp).toBe(originalMaxHp + 10)
    actor.progression.masteries.undead.level = 40
    actor.hp = 5
    actor.energy = 10

    const novice = abilityHero('vanguard')
    novice.progression.masteries.blade.level = 19
    hit(actor, novice, 2000)
    expect(actor.hp).toBe(5)
    expect(actor.energy).toBe(10)

    const worthy = abilityHero('ranger')
    worthy.progression.masteries.arrow.level = 20
    hit(actor, worthy, 3000)
    expect(actor.maxHp).toBe(originalMaxHp + 20)
    expect(actor.hp).toBe(5 + actor.maxHp / 4)
    expect(actor.energy).toBe(10 + effectiveMaxEnergy(actor) / 4)
    const newHp = actor.hp
    const another = abilityHero('arcanist')
    another.progression.masteries.magic.level = 25
    hit(actor, another, 4000)
    expect(actor.hp).toBe(newHp)
    actor.applyDamage(actor.hp, 5000)
    restoreCharacter(actor, 20_000, true)
    expect(actor.maxHp).toBe(originalMaxHp + 10)
})
