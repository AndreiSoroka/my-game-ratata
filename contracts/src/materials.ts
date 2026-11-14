export type MaterialImpact =
    'unarmed' | 'weapon' | 'stone_tool' | 'projectile' | 'arcane'
export type WorldMaterial = 'stone'

/** Fractions apply after the ordinary attack roll, including its critical multiplier. */
export const MATERIAL_DAMAGE_MULTIPLIERS: Record<
    WorldMaterial,
    Record<MaterialImpact, number>
> = {
    stone: {
        unarmed: 0.1,
        weapon: 0.25,
        stone_tool: 1,
        projectile: 0.05,
        arcane: 0.25,
    },
}

export function materialDamage(
    material: WorldMaterial,
    impact: MaterialImpact,
    amount: number
): number {
    return Number.isFinite(amount) && amount > 0
        ? Math.round(
              amount * MATERIAL_DAMAGE_MULTIPLIERS[material][impact] * 100
          ) / 100
        : 0
}
