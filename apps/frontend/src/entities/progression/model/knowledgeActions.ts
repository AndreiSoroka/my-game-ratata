import type { DeityId, LearnAbilityId, SpellSkillId } from '@my-game-ratata/contracts'

export interface LearnAbilitySelection {
    abilityId: LearnAbilityId
    targetId: string
}

export interface ChooseDeitySelection {
    deityId: DeityId
    targetId: string
}

export interface CastSpellSelection {
    skillId: SpellSkillId
    targetId: string
}
