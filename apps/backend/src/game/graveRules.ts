import type { WorldGraveSnapshot } from '@my-game-ratata/contracts'

/** Internal exact state for simulation rules, never serialized directly to an observer. */
export interface GraveCombatTarget extends Omit<WorldGraveSnapshot, 'health'> {
    hp: number
    maxHp: number
}

export interface GraveDamageResult {
    accepted: boolean
    hpDamage: number
    ruined: boolean
}

/** A shared world-object facade; callers never receive mutable source state. */
export interface GraveCombatContext {
    get(id: string): GraveCombatTarget | undefined
    list(locationId: string): readonly GraveCombatTarget[]
    damage(id: string, amount: number, now: number): GraveDamageResult
    purify(id: string, now: number): boolean
}
