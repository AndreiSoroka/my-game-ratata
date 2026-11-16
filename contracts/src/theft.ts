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
    expiresAt: number
    canCallGuards: boolean
    reported: boolean
}

export interface CharacterTheftSnapshot {
    cooldownMsLeft: number
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
