import type { AttackAbilityId, DamageKind } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { resolveCharacterDamage } from '../src/game/abilityDamage'
import type { GameCharacter } from '../src/game/character'
import {
    attemptAbilityAttack,
    resolvePendingAttackHit,
} from '../src/game/combat'
import { applyPrayerGift } from '../src/game/prayerGifts'
import { undeadContactMultiplier } from '../src/game/undeadTactics'
import { abilityHero } from './abilityTestHelpers'

function undead(...stars: string[]): GameCharacter {
    const actor = abilityHero('vanguard', 'undead', 'mob1')
    Object.assign(actor, { faction: 'monsters' })
    actor.position = { x: 100, y: 112 }
    actor.facing = 'up'
    for (const star of stars) {
        actor.progression.constellations.opened.add(`undead.${star}`)
    }
    return actor
}

function context(
    actor: GameCharacter,
    target: GameCharacter,
    now: number,
    targets = [target],
    random = () => 0.9
) {
    return {
        actor,
        targetId: target.id,
        targets,
        now,
        tileSize: 16,
        random,
        respawnDelayMsFor: () => 15_000,
    }
}

function hit(
    actor: GameCharacter,
    target: GameCharacter,
    ability: AttackAbilityId,
    now: number,
    random?: () => number
): number {
    const attack = context(actor, target, now, [target], random)
    expect(attemptAbilityAttack(attack, ability)).toHaveLength(1)
    const before = target.hp
    resolvePendingAttackHit({ ...attack, now: pendingAttack(actor).hitAt })
    return before - target.hp
}

function pendingAttack(actor: GameCharacter) {
    const attack = actor.pendingAttack
    if (attack === undefined) {
        throw new Error('Expected a pending attack after its accepted command')
    }
    return attack
}

function damage(
    actor: GameCharacter,
    target: GameCharacter,
    damageKind: DamageKind,
    now: number,
    amount = 20
): number {
    return resolveCharacterDamage({
        actor,
        target,
        damageKind,
        now,
        amount,
        roundFinal: true,
        respawnDelayMs: 15_000,
    }).hpDamage
}

describe('Undead tactics through the shared combat rules', () => {
    it('builds a bounded arrow formation from nearby allied undead', () => {
        const ranger = abilityHero('ranger')
        const target = undead('hollow_bones2', 'bone_rank')
        const nearby = Array.from({ length: 4 }, () => undead())
        const remote = undead()
        remote.position = { x: 100, y: 170 }
        const otherLocation = undead()
        otherLocation.locationId = 'map-0-0'
        const attack = context(ranger, target, 1000)
        expect(attemptAbilityAttack(attack, 'shot')).toHaveLength(1)
        const pending = pendingAttack(ranger)
        expect(
            undeadContactMultiplier(
                {
                    ...attack,
                    targets: [target, ...nearby, remote, otherLocation],
                },
                pending,
                target,
                attack.random
            )
        ).toBeCloseTo(0.5 / 0.65)
        expect(
            undeadContactMultiplier(
                { ...attack, targets: [target, remote, otherLocation] },
                pending,
                target,
                attack.random
            )
        ).toBe(1)
    })

    it('halves an arrow once per four seconds and arms one melee contact', () => {
        const ranger = abilityHero('ranger')
        const target = undead('hollow_bones2', 'arrow_catch')
        const samples = [0.9, 0.9, 0.9, 0.1]
        const random = () => samples.shift() ?? 0.9
        expect(hit(ranger, target, 'shot', 1000, random)).toBe(2)
        expect(hit(ranger, target, 'shot', 2000, random)).toBe(5)

        const strike = context(target, ranger, 2300)
        expect(attemptAbilityAttack(strike, 'skeleton_strike')).toHaveLength(1)
        const pending = pendingAttack(target)
        expect(undeadContactMultiplier(strike, pending, ranger, random)).toBe(
            1.2
        )
        expect(undeadContactMultiplier(strike, pending, ranger, random)).toBe(1)
    })

    it('marks for allied undead only until the bounded window expires', () => {
        const caller = undead('rattle')
        const ally = undead()
        const enemy = abilityHero('vanguard')
        enemy.maxHp = 150
        enemy.hp = 150
        expect(hit(caller, enemy, 'skeleton_strike', 1000)).toBeGreaterThan(0)
        expect(damage(caller, enemy, 'physical', 1700, 10)).toBe(10)
        expect(damage(ally, enemy, 'physical', 1800, 10)).toBe(11)
        expect(damage(ally, enemy, 'physical', 4600, 10)).toBe(10)
    })

    it('spends ash protection only on holy damage and renews it after twenty seconds', () => {
        const priest = abilityHero()
        const target = undead('ash_crust')
        target.maxHp = 200
        target.hp = 200
        expect(damage(priest, target, 'arcane', 1000)).toBe(20)
        expect(damage(priest, target, 'holy', 2000)).toBe(15)
        expect(damage(priest, target, 'holy', 3000)).toBe(20)
        expect(damage(priest, target, 'holy', 22_000)).toBe(15)
    })

    it('reinforces healing and revival through the existing Grave prayer', () => {
        const priest = abilityHero()
        const target = undead('dust_kin')
        target.hp = 20
        applyPrayerGift(
            priest,
            target,
            { mode: 'restore' },
            1000,
            1,
            'pray_grave'
        )
        expect(target.hp).toBe(28)
        applyPrayerGift(
            target,
            target,
            { mode: 'restore' },
            2000,
            1,
            'pray_grave'
        )
        expect(target.hp).toBe(34)
        target.applyDamage(target.hp, 3000)
        applyPrayerGift(
            priest,
            target,
            { mode: 'revive' },
            4000,
            1,
            'pray_grave',
            undefined,
            {
                successChance: 1,
                hpFraction: 0.5,
                resourceFraction: 0.5,
                angelicChance: 0,
                minimumResource: 0,
            }
        )
        expect(target.hp).toBe(Math.ceil(target.maxHp * 0.65))
    })
})
