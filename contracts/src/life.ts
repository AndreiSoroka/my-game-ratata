export const heroClasses = ['vanguard', 'ranger', 'arcanist', 'cleric'] as const

export type HeroClass = (typeof heroClasses)[number]

export interface CharacterLifeSnapshot {
    retired: boolean
    reviveMsLeft: number
    reviveUntil: number
}

export const HERO_REVIVAL_WINDOW_MS = 60_000
export const REVIVE_CAST_MS = 3_000
export const REVIVE_RANGE = 48
export const REVIVE_MANA_COST = 20
