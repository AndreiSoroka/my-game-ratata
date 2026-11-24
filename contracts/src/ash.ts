export const ASH_RULES = {
    brandDamage: 6,
    brandWindupMs: 1_500,
    brandCooldownMs: 6_000,
    dashDiscount: 5,
    dashDiscountDurationMs: 8_000,
    manaGift: 2,
    manaGiftCooldownMs: 15_000,
    extraHealMana: 5,
    raiseMana: 15,
    raiseWindupMs: 2_500,
    raiseCooldownMs: 30_000,
    raiseDurationMs: 60_000,
    raiseHpFraction: 0.5,
    heartReturnMs: 600_000,
    exhaustion: {
        chanceBonus: 0.1,
        drain: 12,
        durationMs: 30 * 60_000,
        rangeCells: 6,
        speed: 160,
        reductions: [0.2, 0.3, 0.7],
    },
} as const

export type AshExhaustionRank = 1 | 2 | 3

function ranked(ids: ReadonlySet<string>, family: string, ranks: number) {
    let count = 0
    for (let index = 1; index <= ranks; index += 1) {
        count += Number(ids.has(`prayer_grave.${family}${String(index)}`))
    }
    return count
}

function exhaustionRank(ids: ReadonlySet<string>): AshExhaustionRank | 0 {
    return (
        ([3, 2, 1] as const).find((rank) =>
            ids.has(`prayer_grave.exhaustion${String(rank)}`)
        ) ?? 0
    )
}

/** The same rank bonuses drive casts, summons and the build atlas. */
export function resolveAshParameters(ids: ReadonlySet<string>) {
    return {
        healPower: 1 + ranked(ids, 'heal_power', 3) * 0.15,
        healChanceBonus: ranked(ids, 'heal_chance', 2) * 0.03,
        healRadiusCells: ranked(ids, 'heal_radius', 2),
        healWalking: ids.has('prayer_grave.heal_walk'),
        healSecond: ids.has('prayer_grave.heal_second'),
        reviveChanceBonus: ranked(ids, 'revive_chance', 3) * 0.05,
        reviveHpFraction: 0.5 + ranked(ids, 'revive_hp', 3) * 0.1,
        reviveFasterMs: ranked(ids, 'revive_focus', 2) * 150,
        reviveRadiusCells: Number(ids.has('prayer_grave.revive_radius')),
        raiseSlots: 1 + ranked(ids, 'raise_slot', 2),
        raiseDurationMs:
            ASH_RULES.raiseDurationMs + ranked(ids, 'raise_time', 3) * 15_000,
        raiseHpFraction:
            ASH_RULES.raiseHpFraction + ranked(ids, 'raise_hp', 2) * 0.1,
        raiseWindupMs:
            ASH_RULES.raiseWindupMs -
            Number(ids.has('prayer_grave.raise_focus')) * 300,
        omenRank: ranked(ids, 'omen', 4),
        exhaustionRank: exhaustionRank(ids),
        brand: ids.has('prayer_grave.brand'),
        dash: ids.has('prayer_grave.dash'),
        mana: ids.has('prayer_grave.mana'),
    }
}
