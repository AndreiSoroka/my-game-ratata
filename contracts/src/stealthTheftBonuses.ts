/** Pure talent modifiers for the shared simulation and the constellation atlas. */
export function resolveStealthTheftBonuses(activeIds: ReadonlySet<string>) {
    const learned = (id: string) => Number(activeIds.has(id))
    const sneakSpeed =
        10 * learned('shadow.speed') +
        5 * learned('shadow.speed2') +
        5 * learned('shadow.speed3')
    const sneakNoise =
        15 * learned('shadow.noise1') +
        10 * learned('shadow.noise2') +
        10 * learned('shadow.noise3')
    const sneakSight =
        10 * learned('shadow.sight') +
        5 * learned('shadow.sight2') +
        5 * learned('shadow.sight3')
    const theftChance =
        2 * learned('theft.luck1') +
        2 * learned('theft.luck2') +
        4 * learned('theft.luck3')
    const theftRearDetection =
        learned('theft.composure1') +
        learned('theft.composure2') +
        2 * learned('theft.composure3')
    const rhythm = learned('theft.rhythm')
    return {
        sneakSpeedMultiplier: (100 + sneakSpeed) / 100,
        sneakNoiseMultiplier: (100 - sneakNoise) / 100,
        sneakSightMultiplier: (100 - sneakSight) / 100,
        theftEnergyDiscount: learned('theft.economy') + rhythm,
        theftCooldownDiscount: 1000 * (learned('theft.tempo') + rhythm),
        theftChanceBonus: theftChance / 100,
        theftRearDetectionReduction: theftRearDetection / 100,
    }
}
