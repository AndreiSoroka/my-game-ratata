import { MASTERY_REWARDS } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { PendingAttackHit } from './characterState'
import { hasEquippedSword } from './skillProgression'

export function attackMasteryReward(
    actor: GameCharacter,
    abilityId: PendingAttackHit['abilityId']
) {
    if (abilityId === 'spark') {
        return {
            constellationId: 'magic' as const,
            experience: MASTERY_REWARDS.sparkHit,
            evidence: ['arcana'],
        }
    }
    if (abilityId === 'shot') {
        return {
            constellationId: 'arrow' as const,
            experience: MASTERY_REWARDS.shotHit,
            evidence: ['marksmanship'],
        }
    }
    return (abilityId === undefined || abilityId === 'skeleton_strike') &&
        hasEquippedSword(actor)
        ? {
              constellationId: 'blade' as const,
              experience: MASTERY_REWARDS.swordHit,
              evidence: ['swordsmanship'],
          }
        : undefined
}
