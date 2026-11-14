import type { WorldGraveSnapshot } from '@my-game-ratata/contracts'

export interface GraveDamageResult {
    accepted: boolean
    hpDamage: number
    ruined: boolean
}

/** A shared world-object facade; callers never receive mutable source state. */
export interface GraveCombatContext {
    get(id: string): WorldGraveSnapshot | undefined
    list(locationId: string): readonly WorldGraveSnapshot[]
    damage(id: string, amount: number, now: number): GraveDamageResult
    purify(id: string, now: number): boolean
}
