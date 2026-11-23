import type { ItemId } from './index'

export type TheftClientMessage =
    | { type: 'steal'; targetId: string }
    | { type: 'call_guards'; targetId: string }
    | { type: 'report_theft'; targetId: string }
    | { type: 'absolve'; targetId: string }

export interface TheftResult {
    outcome: 'stolen' | 'failed' | 'caught'
    targetId: string
    itemId?: ItemId
    at: number
    text: string
}

export interface TheftAccusation {
    thiefId: string
    thiefName: string
    /** Legacy theft evidence may omit the offense. */
    offense?: 'theft' | 'attack'
    expiresAt: number
    canCallGuards: boolean
    reported: boolean
}

export interface CharacterTheftSnapshot {
    cooldownMsLeft: number
    /** Current attempt cost, private to the authorized actor. */
    energyCost?: number
    wantedMsLeft: number
    blacklisted: boolean
    lastResult: TheftResult | null
    accusations: TheftAccusation[]
}

export const THEFT_RULES = {
    range: 28,
    energyCost: 10,
    cooldownMs: 8_000,
    pairCooldownMs: 60_000,
    quietPracticeWindowMs: 300_000,
    quietPracticeWindowLimit: 8,
    accusationMs: 30_000,
    evidenceMs: 300_000,
    reportRange: 64,
    absolutionRange: 64,
    absolutionGold: 30,
    guardSightRadius: 160,
    retaliationMs: 30_000,
    guardHearingRadius: 640,
    pursuitRadius: 320,
} as const

interface TheftChanceBonuses {
    theftChanceBonus: number
    theftRearDetectionReduction: number
}

/** Two stages before prayer modifiers. `success` is conditional on avoiding detection. */
export function resolveTheftChances(
    frontOrSide: boolean,
    bonuses?: TheftChanceBonuses
) {
    const detected = frontOrSide
        ? 0.2
        : (12 - 100 * (bonuses?.theftRearDetectionReduction ?? 0)) / 100
    const success =
        (frontOrSide ? 0.2 : 0.35 / 0.88) + (bonuses?.theftChanceBonus ?? 0)
    return { detected, success, unnoticed: (1 - detected) * success }
}
