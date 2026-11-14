/** Controller policy over the shared movement, travel and combat rules. */
export const PURSUIT_RULES = {
    observedExitMs: 5_000,
    foreignDurationMs: 10_000,
    foreignRadius: 160,
    homeArrivalRadius: 24,
    replanMs: 300,
    guardianPatrolRadius: 64,
    guardianChaseRadius: 160,
} as const
