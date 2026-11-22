import {
    type GameEventPayload,
    isArrowAbility,
    isBladeAttackAbility,
    MASTERY_REWARDS,
} from '@my-game-ratata/contracts'

import type { DamageResolution } from './abilityDamage'
import type { GameCharacter } from './character'
import type { PendingAttackHit } from './characterState'
import type { AttackContext } from './combat'
import { recordUsefulArrowHit } from './combatArchery'
import { recordRunicContact } from './constellations'
import {
    awardMasteries,
    type captureMasteryFactors,
    hasEquippedSword,
} from './skillProgression'

export function rewardCharacterHit(
    context: AttackContext,
    attack: PendingAttackHit,
    target: GameCharacter,
    result: DamageResolution,
    random: () => number,
    factors: ReturnType<typeof captureMasteryFactors>
): GameEventPayload[] {
    if (result.trainableDamage <= 0) {
        return []
    }
    const { actor, now } = context
    const reward = attackMasteryReward(actor, attack.abilityId)
    if (reward === undefined) {
        return []
    }
    if (attack.arrow !== undefined) {
        recordUsefulArrowHit(context, attack.arrow, target.id)
    }
    const events =
        attack.abilityId === 'spark' || attack.abilityId === 'shot'
            ? recordRunicContact(
                  actor,
                  target.id,
                  attack.abilityId === 'spark' ? 'spell' : 'shot',
                  now
              )
            : []
    events.push(
        ...awardMasteries(actor, [reward], {
            now,
            random,
            factors,
            evidence:
                attack.arrow?.moved === true
                    ? [...reward.evidence, 'moving_shot']
                    : reward.evidence,
        })
    )
    return events
}

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
    if (isArrowAbility(abilityId)) {
        return {
            constellationId: 'arrow' as const,
            experience: MASTERY_REWARDS.shotHit,
            evidence: [
                'marksmanship',
                abilityId === 'shot' ? 'quick_shot' : 'sniper_shot',
            ],
        }
    }
    return (abilityId === undefined ||
        abilityId === 'skeleton_strike' ||
        isBladeAttackAbility(abilityId)) &&
        hasEquippedSword(actor)
        ? {
              constellationId: 'blade' as const,
              experience: MASTERY_REWARDS.swordHit,
              evidence: ['swordsmanship'],
          }
        : undefined
}
