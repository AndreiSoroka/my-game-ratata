import { describe, expect, it } from 'vitest'

import { restoreCharacter } from '../src/game/characterRecovery'
import { createCharacterSheet } from '../src/game/characterSheet'
import {
    effectiveMaxHp,
    effectiveMaxMana,
} from '../src/game/effectiveResources'
import {
    recordMartyrHostileDamage,
    recordMartyrPrayer,
} from '../src/game/martyr'
import {
    consumeResourceRecovery,
    recordUsefulResourceSpend,
} from '../src/game/resourcePractice'
import { abilityHero } from './abilityTestHelpers'

function subject(hp = 100, mana = 100) {
    const actor = abilityHero()
    actor.config.combat.maxHp = hp
    actor.maxHp = hp
    actor.hp = hp
    actor.config.resources.maxMana = mana
    actor.mana = mana
    return actor
}
function unlock(actor: ReturnType<typeof subject>) {
    for (let index = 0; index < 5; index += 1) {
        recordMartyrHostileDamage(actor, 1, index)
        recordMartyrPrayer(
            actor,
            {
                selfHealed: 1,
                otherMeaningful: false,
                receiptId: `cycle-${String(index)}`,
                levelBefore: 2,
            },
            index
        )
    }
}

describe('Martyr effective resource capacities', () => {
    it('reduces capacities while preserving base configuration and existing absolute overflow', () => {
        const actor = subject()
        actor.hp = 110
        actor.mana = 115
        const energy = actor.energy
        unlock(actor)
        expect(effectiveMaxHp(actor)).toBe(70)
        expect(actor.maxHp).toBe(70)
        expect(effectiveMaxMana(actor)).toBe(85)
        expect(actor.hp).toBe(80)
        expect(actor.mana).toBe(100)
        expect(actor.energy).toBe(energy)
        expect(actor.config.combat.maxHp).toBe(100)
        expect(actor.config.resources.maxMana).toBe(100)
    })

    it('keeps partially depleted values below the new cap and clamps the remainder without events or XP', () => {
        const actor = subject()
        actor.hp = 60
        actor.mana = 90
        const masteries = structuredClone(actor.progression.masteries)
        unlock(actor)
        expect(actor.hp).toBe(60)
        expect(actor.mana).toBe(85)
        expect(actor.progression.masteries).toEqual(masteries)
        expect(actor.alive).toBe(true)
    })

    it('floors HP without floating-point boundary loss, never below one, and keeps zero MP species empty', () => {
        const actor = subject(90, 0)
        actor.progression.constellations.opened.add('prayer.martyr')
        expect(actor.maxHp).toBe(63)
        expect(effectiveMaxMana(actor)).toBe(0)
        actor.maxHp = 1
        expect(actor.maxHp).toBe(1)
        expect(actor.baseMaxHp).toBe(1)
    })

    it('uses effective caps for natural recovery, snapshots, private observations and resurrection', () => {
        const actor = subject()
        unlock(actor)
        actor.hp = 1
        actor.mana = 1
        actor.config.hpRegenIdlePerSec = 100
        actor.config.resources.manaRegenIdle = 100
        actor.applyRegen(10_000, false, true, 1)
        expect(actor.hp).toBe(70)
        expect(actor.mana).toBe(85)
        actor.progression.constellations.opened.add('magic.mana3')
        expect(actor.snapshot(1, false).resources.mana).toEqual({
            kind: 'exact',
            current: 85,
            max: 85,
        })
        expect(createCharacterSheet(actor, 16).mana.max).toEqual({
            kind: 'exact',
            value: 85,
        })
        actor.applyDamage(actor.hp, 2)
        restoreCharacter(actor, 3, false)
        expect(actor.hp).toBe(35)
        expect(actor.mana).toBe(42.5)
        expect(actor.maxHp).toBe(70)
        expect(
            actor.progression.constellations.opened.has('prayer.martyr')
        ).toBe(true)
        restoreCharacter(actor, 4, true)
        expect(actor.hp).toBe(70)
        expect(actor.mana).toBe(85)
        actor.mana = 100
        actor.hp = 80
        actor.applyRegen(1000, false, true, 5)
        expect(actor.hp).toBe(80)
        expect(actor.mana).toBe(100)
    })
})

describe('capacity changes reconcile provenance without manufacturing practice', () => {
    it('trims unrecoverable mana losses and retains the same fractional vitality progress', () => {
        const actor = subject()
        actor.hp = 90
        actor.mana = 40
        recordUsefulResourceSpend(actor, 'mana', 60)
        const state = actor.progression.constellations
        state.hostileWound = 10
        state.woundPractice = 19
        state.recoveryPractice = 10
        actor.abilities.untrainableHpDamage = 8
        const mastery = structuredClone(actor.progression.masteries)
        unlock(actor)
        expect(actor.hp).toBe(70)
        expect(state.hostileWound).toBe(0)
        expect(actor.abilities.untrainableHpDamage).toBe(0)
        expect(state.woundPractice).toBeCloseTo(13.3)
        expect(state.recoveryPractice).toBe(7)
        expect(
            actor.resourcePractice.mana.reduce(
                (sum, receipt) => sum + receipt.remaining,
                0
            )
        ).toBe(45)
        expect(consumeResourceRecovery(actor, 'mana', 100, 45)).toBe(45)
        expect(actor.progression.masteries).toEqual(mastery)
    })
})
