/** Conservative scene-wide budgets; categories sum to 32 rendered combat/status effects. */
export const EFFECT_BUDGET = {
    damage: 8,
    transient: 12,
    barrier: 6,
    status: 6,
    particles: 192,
    burstParticles: 12,
} as const
