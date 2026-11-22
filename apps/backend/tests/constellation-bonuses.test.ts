import { describe, expect, it, vi } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { resolveConstellationBonuses } from '../src/game/constellationBonuses'
import { constellationModifiers } from '../src/game/constellationModifiers'

const base = {
    swordDamageMultiplier: 1,
    swordEnergyMultiplier: 1,
    swordTempoMultiplier: 1,
    swordCritBonus: 0,
    swordDodgeBonus: 0,
    stunDurationMultiplier: 1,
    bladeParryChance: 0,
    bladeStunChance: 0.01,
    bladeComboLimit: 0,
    bladeFluidStance: false,
    bladeCounterattack: false,
    bladeGuardRank: 0,
    bladeArrowParry: false,
    bladeLongFrontier: false,
    bladeHealthMultiplier: 1,
    bladeWideArc: false,
    bladeWideFlow: false,
    bladeCircleRing: false,
    bladeCircleAxis: false,
    bladeLongLunge: false,
    bladeLungeRecovery: false,
    bladePommelStun: false,
    bladePommelBreak: false,
    undeadHealthBonus: 0,
    undeadEnergyBonus: 0,
    rangedPhysicalDamageMultiplier: 1,
    shotDamageMultiplier: 1,
    shotRangeCells: 0,
    shotEnergyDiscount: 0,
    shotTempoMultiplier: 1,
    shotCritBonus: 0,
    shotSeriesDamage: 0,
    shotWhileMoving: false,
    movingShotDamage: 0,
    movingShotCritBonus: 0,
    movingShotDashReductionMs: 0,
    movingShotSpeedBonus: 0,
    movingShotFollowupDamage: 0,
    sniperRangeCells: 0,
    sniperWindupReductionMs: 0,
    sniperEnergyDiscount: 0,
    sniperCooldownReductionMs: 0,
    sniperCritBonus: 0,
    sniperOpeningDamage: 0,
    sniperLongRangeDamage: 0,
    sparkDamageMultiplier: 1,
    sparkRangeCells: 0,
    sparkManaDiscount: 0,
    barrierManaPerDamage: 1,
    barrierDurationBonus: 0,
    fireDamageMultiplier: 1,
    chainsDurationMs: 5000,
    chainsPartyImmune: false,
    spellManaMultiplier: 1,
    manaRestMultiplier: 1,
    moveSpeedMultiplier: 1,
    dashEnergyMultiplier: 1,
    foodHealingBonus: 0,
    walkingBootWearMultiplier: 1,
    dashDurationBonus: 0,
    walkingEnergyRegenMultiplier: 1,
    idleEnergyRegenMultiplier: 1,
    energyCapacityMultiplier: 1,
    restEnergyRegenBonus: 0,
    workEnergyMultiplier: 1,
    sneakSpeedMultiplier: 1,
    sneakNoiseMultiplier: 1,
    sneakSightMultiplier: 1,
    theftEnergyDiscount: 0,
    theftChanceBonus: 0,
    theftCooldownDiscount: 0,
    prayerRadiusCells: 0,
    prayerDurationMultiplier: 1,
    prayerGiftMultiplier: 1,
    prayerHarmMultiplier: 1,
    prayerArea: false,
    targetLimit: 1,
    prayerConcentrationChance: 0,
    prayerAbsoluteConcentration: false,
    prayerWardRank: 0,
    prayerAuraProtection: false,
    prayerAuraBlessing: false,
    prayerAuraDomain: false,
    prayerMartyr: false,
    prayerLastLight: false,
    deityInsight: 0,
    otherDeityInsight: 0,
}
const bonuses: Array<[string, Partial<typeof base>]> = [
    ['blade.damage1', { swordDamageMultiplier: 1.1 }],
    ['blade.damage2', { swordDamageMultiplier: 1.15 }],
    ['blade.economy', { swordEnergyMultiplier: 0.9 }],
    ['blade.tempo', { swordTempoMultiplier: 0.9 }],
    ['blade.critical', { swordCritBonus: 0.05 }],
    ['blade.dodge', { bladeParryChance: 0.1 }],
    ['blade.resolve', { stunDurationMultiplier: 0.85 }],
    ['undead.arcane_joints', { undeadHealthBonus: 40 }],
    ['undead.arcane_frame', { undeadHealthBonus: 70 }],
    ['undead.arcane_endurance', { undeadEnergyBonus: 45 }],
    ['undead.arcane_endurance2', { undeadEnergyBonus: 90 }],
    ['undead.hollow_bones', { rangedPhysicalDamageMultiplier: 0.8 }],
    ['undead.hollow_bones2', { rangedPhysicalDamageMultiplier: 0.65 }],
    ['arrow.damage1', { shotDamageMultiplier: 1.1 }],
    ['arrow.damage2', { shotDamageMultiplier: 1.1 }],
    ['arrow.range1', { shotRangeCells: 1 }],
    ['arrow.range2', { shotRangeCells: 1 }],
    ['arrow.economy', { shotEnergyDiscount: 1 }],
    ['arrow.tempo', { shotTempoMultiplier: 0.9 }],
    ['arrow.critical', { shotCritBonus: 0.03 }],
    ['arrow.damage3', { shotDamageMultiplier: 1.05 }],
    ['arrow.economy2', { shotEnergyDiscount: 1 }],
    ['arrow.tempo2', { shotTempoMultiplier: 0.95 }],
    ['arrow.critical2', { shotCritBonus: 0.02 }],
    ['arrow.series1', { shotSeriesDamage: 0.05 }],
    ['arrow.series2', { shotSeriesDamage: 0.05 }],
    ['arrow.sniper_range1', { sniperRangeCells: 1 }],
    ['arrow.sniper_range2', { sniperRangeCells: 1 }],
    ['arrow.sniper_windup1', { sniperWindupReductionMs: 75 }],
    ['arrow.sniper_windup2', { sniperWindupReductionMs: 75 }],
    ['arrow.sniper_economy1', { sniperEnergyDiscount: 2 }],
    ['arrow.sniper_economy2', { sniperEnergyDiscount: 2 }],
    ['arrow.sniper_tempo1', { sniperCooldownReductionMs: 100 }],
    ['arrow.sniper_tempo2', { sniperCooldownReductionMs: 100 }],
    ['arrow.sniper_critical1', { sniperCritBonus: 0.03 }],
    ['arrow.sniper_critical2', { sniperCritBonus: 0.02 }],
    ['arrow.sniper_opening', { sniperOpeningDamage: 0.15 }],
    ['arrow.sniper_long_range', { sniperLongRangeDamage: 0.2 }],
    ['arrow.moving_shot', { shotWhileMoving: true }],
    ['arrow.moving_damage1', { movingShotDamage: 0.05 }],
    ['arrow.moving_damage2', { movingShotDamage: 0.05 }],
    ['arrow.moving_critical1', { movingShotCritBonus: 0.02 }],
    ['arrow.moving_critical2', { movingShotCritBonus: 0.02 }],
    ['arrow.moving_dash1', { movingShotDashReductionMs: 150 }],
    ['arrow.moving_dash2', { movingShotDashReductionMs: 150 }],
    ['arrow.moving_speed1', { movingShotSpeedBonus: 0.05 }],
    ['arrow.moving_speed2', { movingShotSpeedBonus: 0.05 }],
    ['arrow.moving_followup1', { movingShotFollowupDamage: 0.1 }],
    ['arrow.moving_followup2', { movingShotFollowupDamage: 0.1 }],
    ['magic.spark_damage', { sparkDamageMultiplier: 1.1 }],
    ['magic.spark_range', { sparkRangeCells: 1 }],
    ['magic.spark_economy', { sparkManaDiscount: 1 }],
    ['magic.barrier_strength', { barrierManaPerDamage: 0.8 }],
    ['magic.barrier_duration', { barrierDurationBonus: 1000 }],
    ['magic.fire_damage', { fireDamageMultiplier: 1.1 }],
    ['magic.chains_duration', { chainsDurationMs: 10_000 }],
    ['magic.chains_party', { chainsPartyImmune: true }],
    ['magic.spell_economy1', { spellManaMultiplier: 0.8 }],
    ['magic.spell_economy2', { spellManaMultiplier: 0.6 }],
    ['magic.spell_economy3', { spellManaMultiplier: 0.4 }],
    ['magic.mana_rest1', { manaRestMultiplier: 1.1 }],
    ['magic.mana_rest2', { manaRestMultiplier: 1.25 }],
    ['magic.mana_rest3', { manaRestMultiplier: 1.5 }],
    ['life.move', { moveSpeedMultiplier: 1.05 }],
    ['life.dash', { dashEnergyMultiplier: 0.9 }],
    ['life.ration', { foodHealingBonus: 15 }],
    ['life.tread', { walkingBootWearMultiplier: 0.75 }],
    ['life.long_dash', { dashDurationBonus: 700 }],
    [
        'life.breath',
        { walkingEnergyRegenMultiplier: 1.2, idleEnergyRegenMultiplier: 1.5 },
    ],
    ['life.endurance', { energyCapacityMultiplier: 1.1 }],
    ['life.rest', { restEnergyRegenBonus: 0.3 }],
    ['life.work', { workEnergyMultiplier: 0.9 }],
    ['shadow.speed', { sneakSpeedMultiplier: 1.1 }],
    ['shadow.noise1', { sneakNoiseMultiplier: 0.85 }],
    ['shadow.noise2', { sneakNoiseMultiplier: 0.85 }],
    ['shadow.sight', { sneakSightMultiplier: 0.9 }],
    ['shadow.economy', { theftEnergyDiscount: 1 }],
    ['shadow.luck1', { theftChanceBonus: 0.03 }],
    ['shadow.luck2', { theftChanceBonus: 0.03 }],
    ['shadow.tempo', { theftCooldownDiscount: 1000 }],
    ['prayer.radius1', { prayerRadiusCells: 1 }],
    ['prayer.radius2', { prayerRadiusCells: 1 }],
    ['prayer.focus', { prayerDurationMultiplier: 0.9 }],
    ['prayer.gift1', { prayerGiftMultiplier: 2.3 }],
    ['prayer.gift2', { prayerGiftMultiplier: 3.5 }],
    ['prayer.harm1', { prayerHarmMultiplier: 2.3 }],
    ['prayer.harm2', { prayerHarmMultiplier: 4.3 }],
    ['prayer.area', { prayerArea: true }],
]

describe('pure constellation bonuses', () => {
    it('keeps every neutral field and ignores unrelated or unknown metadata IDs', () => {
        expect(resolveConstellationBonuses(new Set())).toEqual(base)
        expect(
            resolveConstellationBonuses(
                new Set([
                    'prayer.root',
                    'prayer.harm',
                    'magic.runic_echo',
                    'life.hp4',
                    'unknown',
                ])
            )
        ).toEqual(base)
    })
    it.each(bonuses)(
        'applies only the authored fields for %s',
        (id, expected) => {
            expect(resolveConstellationBonuses(new Set([id]))).toEqual({
                ...base,
                ...expected,
            })
        }
    )
    it('combines additive bonuses and keeps the highest rank of ranked effects', () => {
        const selected = new Set([
            'blade.damage1',
            'blade.damage2',
            'undead.arcane_joints',
            'undead.arcane_frame',
            'undead.arcane_endurance',
            'undead.arcane_endurance2',
            'undead.hollow_bones',
            'undead.hollow_bones2',
            'arrow.damage1',
            'arrow.damage2',
            'arrow.range1',
            'arrow.range2',
            'shadow.noise1',
            'shadow.noise2',
            'shadow.luck1',
            'shadow.luck2',
            'prayer.radius1',
            'prayer.radius2',
            'prayer.gift1',
            'prayer.gift2',
            'prayer.harm1',
            'prayer.harm2',
            'prayer.omen1',
            'prayer.omen4',
            'prayer.others2',
            'prayer.others3',
        ])
        expect(resolveConstellationBonuses(selected)).toEqual({
            ...base,
            swordDamageMultiplier: 1.25,
            undeadHealthBonus: 70,
            undeadEnergyBonus: 90,
            rangedPhysicalDamageMultiplier: 0.65,
            shotDamageMultiplier: 1.2,
            shotRangeCells: 2,
            sneakNoiseMultiplier: 0.7,
            theftChanceBonus: 0.06,
            prayerRadiusCells: 2,
            prayerGiftMultiplier: 4.8,
            prayerHarmMultiplier: 5.6,
            deityInsight: 4,
            otherDeityInsight: 3,
        })
    })
    it.each([1, 2, 3, 4])(
        'preserves knowledge rank %s without inventing parent validation in the resolver',
        (rank) => {
            expect(
                resolveConstellationBonuses(
                    new Set([
                        `prayer.omen${String(rank)}`,
                        `prayer.others${String(rank)}`,
                    ])
                )
            ).toEqual({ ...base, deityInsight: rank, otherDeityInsight: rank })
        }
    )
    it('requires both the Last Light star and its full external condition', () => {
        expect(resolveConstellationBonuses(new Set(), true)).toEqual(base)
        expect(
            resolveConstellationBonuses(new Set(['prayer.last_light']), false)
        ).toEqual(base)
        expect(
            resolveConstellationBonuses(new Set(['prayer.last_light']), true)
        ).toEqual({
            ...base,
            prayerGiftMultiplier: 11,
            prayerDurationMultiplier: 0.8,
            prayerLastLight: true,
        })
        expect(
            resolveConstellationBonuses(
                new Set(['prayer.last_light', 'prayer.gift1', 'prayer.gift2']),
                true
            ).prayerGiftMultiplier
        ).toBeCloseTo(14.8)
    })
})

describe('authoritative wrapper keeps original hostile low-health predicates', () => {
    const cases = [false, true].flatMap((learned) =>
        [19, 20, 50].flatMap((hp) =>
            [false, true].flatMap((hostile) =>
                [0, 1].map((wound) => ({ learned, hp, hostile, wound }))
            )
        )
    )
    it.each(cases)(
        'matches the old predicate for $learned/$hp/$hostile/$wound',
        ({ learned, hp, hostile, wound }) => {
            const actor = new GameCharacter({
                id: 'bonus-owner',
                nickname: 'Owner',
                archetype: 'human',
                heroClass: 'cleric',
                controllerKind: 'scripted',
                spawnPosition: { x: 0, y: 0 },
            })
            actor.maxHp = 100
            actor.hp = hp
            actor.progression.constellations.opened.clear()
            if (learned) {
                actor.progression.constellations.opened.add('prayer.last_light')
            }
            actor.progression.constellations.lowHpFromHostile = hostile
            actor.progression.constellations.hostileWound = wound
            const expected = learned && hp < 20 && hostile && wound > 0 ? 11 : 1
            expect(constellationModifiers(actor)).toEqual({
                ...base,
                prayerGiftMultiplier: expected,
                prayerDurationMultiplier: expected > 1 ? 0.8 : 1,
                prayerLastLight: expected > 1,
            })
        }
    )
    it('never mutates its source or consumes random draws and clocks', () => {
        const ids = new Set(['prayer.harm1', 'prayer.harm2', 'prayer.omen4'])
        const before = [...ids]
        const random = vi.spyOn(Math, 'random')
        const clock = vi.spyOn(Date, 'now')
        const first = resolveConstellationBonuses(ids)
        first.prayerHarmMultiplier = 99
        expect(resolveConstellationBonuses(ids).prayerHarmMultiplier).toBe(5.6)
        expect([...ids]).toEqual(before)
        expect(random).not.toHaveBeenCalled()
        expect(clock).not.toHaveBeenCalled()
        random.mockRestore()
        clock.mockRestore()
    })
})
