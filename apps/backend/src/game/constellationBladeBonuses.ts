/** All percentages in one category add from the same unmodified weapon/body basis. */
export function resolveBladeBonuses(ids: ReadonlySet<string>) {
    const learned = (id: string) => Number(ids.has(`blade.${id}`))
    return {
        swordDamageMultiplier:
            (100 +
                10 * learned('root') +
                10 * learned('damage1') +
                15 * learned('damage2')) /
            100,
        swordEnergyMultiplier:
            (100 -
                5 * learned('root') -
                10 * learned('economy') -
                15 * learned('economy2')) /
            100,
        swordTempoMultiplier:
            (100 -
                5 * learned('root') -
                10 * learned('tempo') -
                15 * learned('tempo2')) /
            100,
        swordCritBonus: 0.05 * (learned('critical') + learned('critical2')),
        swordDodgeBonus:
            (5 * learned('root') + 10 * learned('ideal_position')) / 100,
        stunDurationMultiplier:
            (100 -
                5 * learned('root') -
                15 * learned('resolve') -
                15 * learned('resolve2')) /
            100,
        bladeParryChance: ids.has('blade.dodge2')
            ? 0.15
            : ids.has('blade.dodge')
              ? 0.1
              : 0,
        bladeStunChance: ids.has('blade.stun3')
            ? 0.2
            : ids.has('blade.stun2')
              ? 0.1
              : ids.has('blade.stun1')
                ? 0.05
                : 0.01,
        bladeComboLimit: ids.has('blade.combo3')
            ? 10
            : ids.has('blade.combo2')
              ? 5
              : ids.has('blade.combo1')
                ? 3
                : 0,
        bladeFluidStance: ids.has('blade.fluid_stance'),
        bladeCounterattack: ids.has('blade.counterattack'),
        bladeGuardRank: ids.has('blade.guard_strong')
            ? 2
            : ids.has('blade.defensive_stance')
              ? 1
              : 0,
        bladeArrowParry: ids.has('blade.arrow_deflect'),
        bladeLongFrontier: ids.has('blade.long_frontier'),
        bladeHealthMultiplier: ids.has('blade.steel_sinew') ? 1.1 : 1,
        bladeWideArc: ids.has('blade.wide_arc'),
        bladeWideFlow: ids.has('blade.wide_flow'),
        bladeCircleRing: ids.has('blade.circle_ring'),
        bladeCircleAxis: ids.has('blade.circle_axis'),
        bladeLongLunge: ids.has('blade.long_lunge'),
        bladeLungeRecovery: ids.has('blade.lunge_recovery'),
        bladePommelStun: ids.has('blade.pommel_stun'),
        bladePommelBreak: ids.has('blade.pommel_break'),
    }
}
