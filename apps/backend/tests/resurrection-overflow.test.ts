import {
    calculateResurrectionResources,
    resolveResurrectionParameters,
} from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { resolveCharacterDamage } from '../src/game/abilityDamage'
import { GameCharacter } from '../src/game/character'
import { regen } from '../src/game/characterState'
import { prayerResourceMissing } from '../src/game/prayerContext'
import { applyPrayerGift } from '../src/game/prayerGifts'
import {
    practiceResourceMissing,
    recordUsefulResourceSpend,
} from '../src/game/resourcePractice'
import { recordVitalityRecovery } from '../src/game/vitalityPractice'
import { heal } from '../src/game/worldInventoryHelpers'
import { abilityHero } from './abilityTestHelpers'
import { masteryExperience } from './prayerMasteryTestHelpers'

function excessHero() {
    const actor = abilityHero()
    const parameters = resolveResurrectionParameters(
        'pray',
        new Set(['prayer.revive_angelic']),
        'neutral'
    )
    Object.assign(
        actor,
        calculateResurrectionResources(
            parameters,
            {
                hp: actor.maxHp,
                mana: actor.config.resources.maxMana,
                energy: actor.config.resources.maxEnergy,
            },
            true
        )
    )
    return actor
}
it('preserves excess resources across idle/moving regeneration, zero rates and snapshots', () => {
    const actor = excessHero()
    const expected = { hp: actor.hp, mana: actor.mana, energy: actor.energy }
    const experience = masteryExperience(actor, 'life')
    for (const moving of [false, true]) {
        actor.applyRegen(60000, moving, true, 60000)
        actor.applyRegen(60000, moving, false, 120000)
        expect({
            hp: actor.hp,
            mana: actor.mana,
            energy: actor.energy,
        }).toEqual(expected)
    }
    expect(regen(150, 100, 0, 60000)).toBe(150)
    expect(regen(1, 0, 0, 60000)).toBe(1)
    actor.connected = false
    actor.tags.add('offline')
    actor.applyRegen(60000, false, true, 180000)
    expect(actor.snapshot(180000).health).toMatchObject({
        kind: 'exact',
        current: expected.hp,
    })
    expect(actor.snapshot(180000).resources.mana).toMatchObject({
        kind: 'exact',
        current: expected.mana,
    })
    actor.connected = true
    actor.tags.delete('offline')
    expect(actor.hp).toBe(expected.hp)
    expect(masteryExperience(actor, 'life')).toBe(experience)
})
it('food and restoration prayers neither cut excess nor manufacture useful recovery', () => {
    const actor = excessHero()
    const caster = abilityHero()
    const expected = { hp: actor.hp, mana: actor.mana, energy: actor.energy }
    expect(heal(actor, 100)).toBe(0)
    for (const abilityId of ['pray', 'pray_road', 'pray_lantern'] as const) {
        expect(prayerResourceMissing(caster, actor, abilityId)).toBe(0)
        expect(
            applyPrayerGift(
                caster,
                actor,
                { mode: 'restore', targetId: actor.id },
                1000,
                1.3,
                abilityId
            )
        ).toEqual({ events: [], meaningful: false, hpRecovery: false })
    }
    expect({ hp: actor.hp, mana: actor.mana, energy: actor.energy }).toEqual(
        expected
    )
    expect(practiceResourceMissing(actor, 'mana')).toBe(0)
    expect(practiceResourceMissing(actor, 'energy')).toBe(0)
    expect(recordVitalityRecovery(actor, 0, 1000)).toEqual([])
})
it('spends excess first and gives recovery credit only for actual deficit below the ordinary maximum', () => {
    const actor = excessHero()
    const maxEnergy = actor.config.resources.maxEnergy
    actor.energy -= maxEnergy * 0.25
    recordUsefulResourceSpend(actor, 'energy', maxEnergy * 0.25)
    expect(practiceResourceMissing(actor, 'energy')).toBe(0)
    actor.energy -= maxEnergy * 0.5
    recordUsefulResourceSpend(actor, 'energy', maxEnergy * 0.5)
    expect(practiceResourceMissing(actor, 'energy')).toBe(maxEnergy * 0.25)
    actor.applyRegen(100000, false, true, 100000)
    expect(actor.energy).toBe(maxEnergy)
    expect(practiceResourceMissing(actor, 'energy')).toBe(0)
})
it('keeps hostile and untrainable wound ledgers nonnegative while excess HP absorbs damage', () => {
    const actor = excessHero()
    const enemy = new GameCharacter({
        id: 'overflow-enemy',
        nickname: 'Enemy',
        archetype: 'skeleton',
        creatureType: 'undead',
        heroClass: 'vanguard',
        controllerKind: 'mob1',
        faction: 'monsters',
        spawnPosition: { x: 100, y: 100 },
    })
    const initialHp = actor.hp
    const damage = (amount: number) =>
        resolveCharacterDamage({
            actor: enemy,
            target: actor,
            amount,
            now: 1000,
            damageKind: 'holy',
            respawnDelayMs: 15000,
        })
    damage(5)
    expect(actor.hp).toBe(initialHp - 5)
    expect(actor.progression.constellations.hostileWound).toBe(0)
    expect(actor.abilities.untrainableHpDamage).toBe(0)
    damage(actor.hp - actor.maxHp + 2)
    expect(actor.hp).toBe(actor.maxHp - 2)
    expect(actor.progression.constellations.hostileWound).toBe(2)
    expect(actor.abilities.untrainableHpDamage).toBe(0)
    expect(heal(actor, 100)).toBe(2)
    recordVitalityRecovery(actor, 2, 2000)
    expect(actor.hp).toBe(actor.maxHp)
    expect(actor.progression.constellations.hostileWound).toBe(0)
})
