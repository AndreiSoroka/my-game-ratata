export type SpellSkillId = 'fireball' | 'greater_fireball'

export type DeityId = 'hearth' | 'road' | 'lantern' | 'grave'
export type DeityMood = 'benevolent' | 'neutral' | 'wrathful'

export interface DeitySnapshot {
    id: DeityId
    name: string
    domain: string
    omen: string
    perception: 'vague' | 'hint' | 'clear' | 'precise'
    mood: DeityMood | null
    successChance: number | null
    /** Additional Hearth prayer chances visible to the owner after earning insight. */
    hearthPrayerChances?: {
        purificationPerStep: number
        resurrection: number | null
    }
    changesInMs: number | null
}

export interface ProgressionSnapshot {
    masteries: Array<import('./mastery').MasterySnapshot>
    deity: DeitySnapshot
    otherDeities?: DeitySnapshot[]
    constellations?: import('./development').ConstellationSnapshot
    magicChaptersRead: number
    magicChaptersTotal: number
    resurrectionUnlocked: boolean
    resurrectionSchools?: Array<import('./abilities').PrayerAbilityId>
}

export type SkillProgressionSnapshot = ProgressionSnapshot
export type ProgressionClientMessage =
    | { type: 'pray'; abilityId?: import('./abilities').PrayerActionId }
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
