import { resolveBladeBonuses } from './constellationBladeBonuses'
import {
    manaRestMultipliers,
    spellManaMultipliers,
} from './constellationMagicStars'

export const ENDURANCE_ENERGY_PERCENT = 110

/** Pure bonuses shared by authoritative characters and isolated atlas builds. */
export function resolveConstellationBonuses(
    activeIds: ReadonlySet<string>,
    lastLightEligible = false
) {
    const learned = (id: string) => Number(activeIds.has(id))
    const rank = (prefix: string, maximum: number) => {
        for (let level = maximum; level > 0; level -= 1) {
            if (activeIds.has(`${prefix}${String(level)}`)) {
                return level
            }
        }
        return 0
    }
    return {
        ...resolveBladeBonuses(activeIds),
        shotDamageMultiplier:
            1 + 0.1 * (learned('arrow.damage1') + learned('arrow.damage2')),
        shotRangeCells: learned('arrow.range1') + learned('arrow.range2'),
        shotEnergyDiscount: learned('arrow.economy'),
        shotTempoMultiplier: 1 - 0.1 * learned('arrow.tempo'),
        shotCritBonus: 0.03 * learned('arrow.critical'),
        sparkDamageMultiplier: 1 + 0.1 * learned('magic.spark_damage'),
        sparkRangeCells: learned('magic.spark_range'),
        sparkManaDiscount: learned('magic.spark_economy'),
        barrierManaPerDamage: learned('magic.barrier_strength') === 1 ? 0.8 : 1,
        barrierDurationBonus: 1000 * learned('magic.barrier_duration'),
        fireDamageMultiplier: 1 + 0.1 * learned('magic.fire_damage'),
        chainsDurationMs:
            learned('magic.chains_duration') === 1 ? 10_000 : 5_000,
        chainsPartyImmune: learned('magic.chains_party') === 1,
        spellManaMultiplier:
            spellManaMultipliers[rank('magic.spell_economy', 3)] ?? 1,
        manaRestMultiplier:
            manaRestMultipliers[rank('magic.mana_rest', 3)] ?? 1,
        moveSpeedMultiplier: 1 + 0.05 * learned('life.move'),
        dashEnergyMultiplier: 1 - 0.1 * learned('life.dash'),
        foodHealingBonus: 15 * learned('life.ration'),
        walkingBootWearMultiplier: 1 - 0.25 * learned('life.tread'),
        dashDurationBonus: 700 * learned('life.long_dash'),
        walkingEnergyRegenMultiplier: 1 + 0.2 * learned('life.breath'),
        idleEnergyRegenMultiplier: 1 + 0.5 * learned('life.breath'),
        energyCapacityMultiplier: activeIds.has('life.endurance')
            ? ENDURANCE_ENERGY_PERCENT / 100
            : 1,
        restEnergyRegenBonus: 0.3 * learned('life.rest'),
        workEnergyMultiplier: 1 - 0.1 * learned('life.work'),
        sneakSpeedMultiplier: 1 + 0.1 * learned('shadow.speed'),
        sneakNoiseMultiplier:
            1 - 0.15 * (learned('shadow.noise1') + learned('shadow.noise2')),
        sneakSightMultiplier: 1 - 0.1 * learned('shadow.sight'),
        theftEnergyDiscount: learned('shadow.economy'),
        theftChanceBonus:
            0.03 * (learned('shadow.luck1') + learned('shadow.luck2')),
        theftCooldownDiscount: 1000 * learned('shadow.tempo'),
        ...prayerBonuses(activeIds, lastLightEligible),
        deityInsight: rank('prayer.omen', 4),
        otherDeityInsight: rank('prayer.others', 4),
    }
}

function prayerBonuses(
    activeIds: ReadonlySet<string>,
    lastLightEligible: boolean
) {
    const learned = (id: string) => Number(activeIds.has(id))
    const lastLight = activeIds.has('prayer.last_light') && lastLightEligible
    const martyr = activeIds.has('prayer.martyr')
    return {
        prayerRadiusCells:
            learned('prayer.radius1') + learned('prayer.radius2'),
        prayerDurationMultiplier: Math.max(
            0.1,
            1 -
                0.1 * learned('prayer.focus') -
                0.2 * learned('prayer.concentration') -
                0.1 * learned('prayer.absolute_concentration') -
                0.05 * learned('prayer.hasty_harm') -
                (lastLight ? 0.2 : 0) -
                (martyr ? 0.15 : 0)
        ),
        prayerGiftMultiplier:
            1 +
            1.3 * learned('prayer.gift1') +
            2.5 * learned('prayer.gift2') +
            (lastLight ? 10 : 0) +
            (martyr ? 0.15 : 0),
        prayerHarmMultiplier: Math.max(
            0,
            1 +
                1.3 * learned('prayer.harm1') +
                3.3 * learned('prayer.harm2') -
                learned('prayer.hasty_harm')
        ),
        targetLimit: activeIds.has('prayer.targets3')
            ? 20
            : activeIds.has('prayer.targets2')
              ? 5
              : activeIds.has('prayer.targets1')
                ? 2
                : 1,
        prayerConcentrationChance: activeIds.has(
            'prayer.absolute_concentration'
        )
            ? 1
            : activeIds.has('prayer.concentration')
              ? 0.5
              : 0,
        prayerAbsoluteConcentration: activeIds.has(
            'prayer.absolute_concentration'
        ),
        prayerWardRank: highestRank(activeIds, 'prayer.ward', 4),
        prayerAuraProtection: activeIds.has('prayer.aura_protection'),
        prayerAuraBlessing: activeIds.has('prayer.aura_blessing'),
        prayerAuraDomain: activeIds.has('prayer.aura_domain'),
        prayerMartyr: martyr,
        prayerLastLight: lastLight,
        prayerArea: activeIds.has('prayer.area'),
    }
}

function highestRank(
    ids: ReadonlySet<string>,
    prefix: string,
    maximum: number
): number {
    for (let level = maximum; level > 0; level -= 1) {
        if (ids.has(`${prefix}${String(level)}`)) {
            return level
        }
    }
    return 0
}
