import {
    type GameEventPayload,
    MASTERY_REWARDS,
    PRAYER_SCHOOL_DEFINITIONS,
    prayerSchoolId,
    type ResurrectionParameters,
} from '@my-game-ratata/contracts'

import type { PrayerCast } from './abilityState'
import type { GameCharacter } from './character'
import { type resolveMiracle } from './deities'
import { unansweredPrayer } from './prayerFeedback'
import { applyPrayerGift } from './prayerGifts'
import { awardMasteries, captureMasteryFactors } from './skillProgression'

export function completeReviveWithoutContext(
    caster: GameCharacter,
    target: GameCharacter,
    cast: Pick<PrayerCast, 'abilityId' | 'receiptId'>,
    now: number,
    outcome: ReturnType<typeof resolveMiracle>,
    resurrection: ResurrectionParameters,
    random?: () => number
): GameEventPayload[] {
    if (!outcome.success) {
        return [unansweredPrayer(caster.id, cast.abilityId)]
    }
    const factors = captureMasteryFactors(caster)
    const lowHpGift =
        caster.hp < caster.maxHp * 0.2 &&
        caster.progression.constellations.hostileWound > 0 &&
        caster.progression.constellations.lowHpFromHostile
    const gift = applyPrayerGift(
        caster,
        target,
        { mode: 'revive', targetId: target.id },
        now,
        outcome.quality,
        cast.abilityId,
        undefined,
        resurrection,
        random
    )
    return [
        ...gift.events,
        ...awardMasteries(
            caster,
            gift.meaningful
                ? [
                      {
                          constellationId:
                              PRAYER_SCHOOL_DEFINITIONS[
                                  prayerSchoolId(cast.abilityId)
                              ].constellationId,
                          experience: MASTERY_REWARDS.resurrection,
                      },
                  ]
                : [],
            {
                now,
                random,
                receiptId: cast.receiptId,
                factors,
                evidence:
                    gift.meaningful && cast.abilityId === 'pray'
                        ? [
                              'prayer',
                              'gift',
                              ...(lowHpGift ? ['low_hp_gift'] : []),
                          ]
                        : [],
            }
        ),
    ]
}
