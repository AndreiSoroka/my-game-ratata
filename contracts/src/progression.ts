export const skillIds = [
    'stealth',
    'theft',
    'swordsmanship',
    'miracles',
    'faith',
    'arcana',
    'fireball',
    'greater_fireball',
] as const
export type SkillId = (typeof skillIds)[number]
export type SpellSkillId = 'fireball' | 'greater_fireball'

export interface SkillSnapshot {
    id: SkillId
    name: string
    level: number
    practice: number
    practiceToNext: number
    unlocked: boolean
}

export type DeityId = 'hearth' | 'road' | 'lantern' | 'grave'
export type DeityMood = 'benevolent' | 'neutral' | 'wrathful'
export type SkillBranch = 'warfare' | 'faith' | 'arcana' | 'cunning'

export interface DeitySnapshot {
    id: DeityId
    name: string
    domain: string
    omen: string
    perception: 'vague' | 'hint' | 'clear' | 'precise'
    mood: DeityMood | null
    successChance: number | null
    changesInMs: number | null
}

export interface ProgressionSnapshot {
    skills: SkillSnapshot[]
    deity: DeitySnapshot
    practicedBranches: SkillBranch[]
    magicChaptersRead: number
    magicChaptersTotal: number
    totalEarnedLevels: number
    trainingMultiplier: number
    resurrectionUnlocked: boolean
}

export type SkillProgressionSnapshot = ProgressionSnapshot
export type ProgressionClientMessage =
    | { type: 'pray' }
    | { type: 'choose_deity'; deityId: DeityId; targetId: string }
    | { type: 'study_magic'; targetId: string }
    | { type: 'teach_magic'; targetId: string }
    | { type: 'learn_skill'; skillId: 'fireball'; targetId: string }
    | {
          type: 'cast_spell'
          skillId: SpellSkillId
          targetId?: string
          target?: import('./graves').WorldCombatTarget
      }
export type ProgressionCommand = ProgressionClientMessage
