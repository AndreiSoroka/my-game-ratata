import {
    QUICK_SHOT_RULES,
    resolveStealthTheftBonuses,
} from '@my-game-ratata/contracts'

import { resolveBladeBonuses } from './constellationBladeBonuses'
import {
    manaRestMultipliers,
    spellManaMultipliers,
} from './constellationMagicStars'
import { resolveUndeadBonuses } from './constellationUndead'

export const ENDURANCE_ENERGY_PERCENT = 110

export function constellationMoveSpeedMultiplier(
    activeIds: ReadonlySet<string>
): number {
    return activeIds.has('life.move') ? 1.05 : 1
}

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
        ...resolveArrowBonuses(activeIds),
        ...resolveUndeadBonuses(activeIds),
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
        moveSpeedMultiplier: constellationMoveSpeedMultiplier(activeIds),
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
        ...resolveStealthTheftBonuses(activeIds),
        ...prayerBonuses(activeIds, lastLightEligible),
        deityInsight: rank('prayer.omen', 4),
        otherDeityInsight: rank('prayer.others', 4),
    }
}

function resolveArrowBonuses(activeIds: ReadonlySet<string>) {
    const learned = (id: string) => Number(activeIds.has(`arrow.${id}`))
    const stages = (id: string) => learned(`${id}1`) + learned(`${id}2`)
    return {
        shotDamageMultiplier:
            1 + (10 * stages('damage') + 5 * learned('damage3')) / 100,
        shotRangeCells: stages('range'),
        shotEnergyDiscount:
            QUICK_SHOT_RULES.energyDiscount * learned('economy') +
            learned('economy2'),
        shotTempoMultiplier:
            1 - (10 * learned('tempo') + 5 * learned('tempo2')) / 100,
        shotCritBonus:
            (3 * learned('critical') + 2 * learned('critical2')) / 100,
        shotSeriesDamage:
            (QUICK_SHOT_RULES.seriesDamagePercent * learned('series1') +
                5 * learned('series2')) /
            100,
        shotWhileMoving: activeIds.has('arrow.moving_shot'),
        movingShotDamage: 0.05 * stages('moving_damage'),
        movingShotCritBonus: 0.02 * stages('moving_critical'),
        movingShotDashReductionMs: 150 * stages('moving_dash'),
        movingShotSpeedBonus: 0.05 * stages('moving_speed'),
        movingShotFollowupDamage: 0.1 * stages('moving_followup'),
        sniperRangeCells: stages('sniper_range'),
        sniperWindupReductionMs: 75 * stages('sniper_windup'),
        sniperEnergyDiscount: 2 * stages('sniper_economy'),
        sniperCooldownReductionMs: 100 * stages('sniper_tempo'),
        sniperCritBonus:
            (3 * learned('sniper_critical1') +
                2 * learned('sniper_critical2')) /
            100,
        sniperOpeningDamage: 0.15 * learned('sniper_opening'),
        sniperLongRangeDamage: 0.2 * learned('sniper_long_range'),
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
