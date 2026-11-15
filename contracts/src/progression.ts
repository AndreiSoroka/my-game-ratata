export const skillIds = [
    'stealth',
    'theft',
    'swordsmanship',
    'miracles',
    'faith',
    'road_faith',
    'road_miracles',
    'lantern_faith',
    'lantern_miracles',
    'grave_faith',
    'grave_miracles',
    'arcana',
    'fireball',
    'greater_fireball',
    'marksmanship',
    'vitality',
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
export type SkillBranch =
    'warfare' | 'faith' | 'arcana' | 'cunning' | 'survival'

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
    otherDeities?: DeitySnapshot[]
    constellations?: import('./development').ConstellationSnapshot
    practicedBranches: SkillBranch[]
    magicChaptersRead: number
    magicChaptersTotal: number
    totalEarnedLevels: number
    trainingMultiplier: number
    resurrectionUnlocked: boolean
    resurrectionSchools?: Array<import('./abilities').PrayerAbilityId>
}

export type SkillProgressionSnapshot = ProgressionSnapshot
export type ProgressionClientMessage =
    | { type: 'pray'; abilityId?: import('./abilities').PrayerAbilityId }
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
