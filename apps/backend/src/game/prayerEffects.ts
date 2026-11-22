import {
    type GameEventPayload,
    PRAYER_SCHOOL_DEFINITIONS,
    type PrayerActionId,
    type PrayerIntent,
    prayerSchoolId,
} from '@my-game-ratata/contracts'

import type { AbilityContext } from './abilityContext'
import type { RoadPrayerCastState } from './abilityState'
import type { GameCharacter } from './character'
import { constellationModifiers } from './constellations'
import { miracleChance } from './deities'
import { resetMartyrStreak } from './martyr'
import { unansweredPrayer } from './prayerFeedback'
import { applyPrayerGifts } from './prayerGifts'
import { applyPrayerGraves } from './prayerGraves'
import { applyPrayerWave } from './prayerWave'
import { characterResurrectionParameters } from './resurrection'
import { awardMasteries, captureMasteryFactors } from './skillProgression'

/** Freeze modifiers and conflict factors before resolving the completed cast and its awards. */
export function completePrayer(
    actor: GameCharacter,
    intent: PrayerIntent,
    context: AbilityContext,
    roll: number,
    quality: number,
    receiptId?: string,
    abilityId: PrayerActionId = 'pray',
    road?: RoadPrayerCastState
): GameEventPayload[] {
    if (intent.mode === 'devotion') {
        return []
    }
    // Capture modifiers and low-health evidence before any healing or learning.
    const school = PRAYER_SCHOOL_DEFINITIONS[prayerSchoolId(abilityId)]
    const factors = captureMasteryFactors(actor)
    const modifiers = constellationModifiers(actor)
    const resurrection =
        intent.mode === 'revive'
            ? characterResurrectionParameters(actor, abilityId, context.now)
            : undefined
    const lowHpGift = wasLowHpGift(actor, abilityId)
    const castReceipt =
        receiptId ??
        `${actor.id}:prayer:${String(++actor.abilities.prayerSequence)}`
    const answered =
        roll <
        (resurrection?.successChance ??
            miracleChance(actor, context.now, school.deityId))
    const gift = applyPrayerGifts(
        actor,
        intent,
        context,
        answered,
        quality * (abilityId === 'pray' ? modifiers.prayerGiftMultiplier : 1),
        abilityId,
        factors,
        resurrection,
        road
    )
    const wave = applyPrayerWave(
        actor,
        context,
        roll,
        quality * modifiers.prayerHarmMultiplier,
        abilityId
    )
    const graves = applyPrayerGraves(
        actor,
        intent,
        context,
        roll,
        castReceipt,
        abilityId
    )
    const events = [...gift.events, ...wave.events, ...graves.events]
    if (events.length === 0 && (road === undefined || !answered)) {
        events.push(unansweredPrayer(actor.id, abilityId))
    }
    const experience = gift.experience + wave.experience + graves.experience
    if (experience > 0) {
        resetMartyrStreak(actor)
    }
    return [
        ...events,
        ...awardMasteries(actor, prayerReward(abilityId, experience), {
            now: context.now,
            random: context.random,
            receiptId: castReceipt,
            factors,
            evidence: prayerEvidence(
                abilityId,
                gift.meaningful,
                wave.meaningful,
                graves.meaningful,
                lowHpGift
            ),
        }),
    ]
}

function prayerReward(abilityId: PrayerActionId, experience: number) {
    return experience > 0
        ? [
              {
                  constellationId:
                      PRAYER_SCHOOL_DEFINITIONS[prayerSchoolId(abilityId)]
                          .constellationId,
                  experience,
              },
          ]
        : []
}

function prayerEvidence(
    abilityId: PrayerActionId,
    gift: boolean,
    harm: boolean,
    purify: boolean,
    lowHpGift: boolean
): string[] {
    if (abilityId !== 'pray') {
        return []
    }
    const evidence = ['prayer']
    if (gift) {
        evidence.push('gift')
    }
    if (gift && lowHpGift) {
        evidence.push('low_hp_gift')
    }
    if (harm) {
        evidence.push('harm')
    }
    if (purify) {
        evidence.push('purify')
    }
    return evidence
}

function wasLowHpGift(
    actor: GameCharacter,
    abilityId: PrayerActionId
): boolean {
    return (
        abilityId === 'pray' &&
        actor.hp < actor.maxHp * 0.2 &&
        actor.progression.constellations.hostileWound > 0 &&
        actor.progression.constellations.lowHpFromHostile
    )
}
