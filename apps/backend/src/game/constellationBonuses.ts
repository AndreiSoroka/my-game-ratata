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
    const lastLight = activeIds.has('prayer.last_light') && lastLightEligible
    return {
        swordDamageMultiplier:
            1 + 0.1 * (learned('blade.damage1') + learned('blade.damage2')),
        swordEnergyMultiplier: 1 - 0.1 * learned('blade.economy'),
        swordTempoMultiplier: 1 - 0.1 * learned('blade.tempo'),
        swordCritBonus: 0.03 * learned('blade.critical'),
        swordDodgeBonus: 0.03 * learned('blade.dodge'),
        stunDurationMultiplier: 1 - 0.15 * learned('blade.resolve'),
        shotDamageMultiplier:
            1 + 0.1 * (learned('arrow.damage1') + learned('arrow.damage2')),
        shotRangeCells: learned('arrow.range1') + learned('arrow.range2'),
        shotEnergyDiscount: learned('arrow.economy'),
        shotTempoMultiplier: 1 - 0.1 * learned('arrow.tempo'),
        shotCritBonus: 0.03 * learned('arrow.critical'),
        sparkDamageMultiplier: 1 + 0.1 * learned('magic.spark_damage'),
        sparkRangeCells: learned('magic.spark_range'),
        sparkManaDiscount: learned('magic.spark_economy'),
        barrierAbsorptionBonus: 2 * learned('magic.barrier_strength'),
        barrierDurationBonus: 1000 * learned('magic.barrier_duration'),
        fireDamageMultiplier: 1 + 0.1 * learned('magic.fire_damage'),
        moveSpeedMultiplier: 1 + 0.05 * learned('life.move'),
        dashEnergyMultiplier: 1 - 0.1 * learned('life.dash'),
        sneakSpeedMultiplier: 1 + 0.1 * learned('shadow.speed'),
        sneakNoiseMultiplier:
            1 - 0.15 * (learned('shadow.noise1') + learned('shadow.noise2')),
        sneakSightMultiplier: 1 - 0.1 * learned('shadow.sight'),
        theftEnergyDiscount: learned('shadow.economy'),
        theftChanceBonus:
            0.03 * (learned('shadow.luck1') + learned('shadow.luck2')),
        theftCooldownDiscount: 1000 * learned('shadow.tempo'),
        prayerRadiusCells:
            learned('prayer.radius1') + learned('prayer.radius2'),
        prayerDurationMultiplier: 1 - 0.1 * learned('prayer.focus'),
        prayerGiftMultiplier:
            1 +
            0.05 * (learned('prayer.gift1') + learned('prayer.gift2')) +
            (lastLight ? 0.1 : 0),
        prayerHarmMultiplier:
            1 + 0.3 * (learned('prayer.harm1') + learned('prayer.harm2')),
        prayerArea: activeIds.has('prayer.area'),
        deityInsight: rank('prayer.omen', 4),
        otherDeityInsight: rank('prayer.others', 4),
    }
}
