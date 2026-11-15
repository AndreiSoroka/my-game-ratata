import {
    type GameEventPayload,
    PRAYER_SCHOOL_DEFINITIONS,
    type PrayerAbilityId,
    type PrayerIntent,
} from '@my-game-ratata/contracts'

import type { AbilityContext } from './abilityContext'
import type { GameCharacter } from './character'
import { constellationModifiers } from './constellations'
import { miracleChance } from './deities'
import { applyPrayerGifts } from './prayerGifts'
import { applyPrayerGraves } from './prayerGraves'
import { applyPrayerWave } from './prayerWave'
import { awardMasteries, captureMasteryFactors } from './skillProgression'

/** One completed cast, one random sample and one frozen conflict factor per mastery. */
export function completePrayer(
    actor: GameCharacter,
    intent: PrayerIntent,
    context: AbilityContext,
    roll: number,
    quality: number,
    receiptId?: string,
    abilityId: PrayerAbilityId = 'pray'
): GameEventPayload[] {
    if (intent.mode === 'devotion') {
        return []
    }
    // Capture modifiers and low-health evidence before any healing or learning.
    const school = PRAYER_SCHOOL_DEFINITIONS[abilityId]
    const factors = captureMasteryFactors(actor)
    const modifiers = constellationModifiers(actor)
    const lowHpGift = wasLowHpGift(actor, abilityId)
    const castReceipt =
        receiptId ??
        `${actor.id}:prayer:${String(++actor.abilities.prayerSequence)}`
    const gift = applyPrayerGifts(
        actor,
        intent,
        context,
        roll < miracleChance(actor, context.now, school.deityId),
        quality * (abilityId === 'pray' ? modifiers.prayerGiftMultiplier : 1),
        abilityId,
        factors
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
    if (events.length === 0) {
        events.push(unansweredPrayer(actor, abilityId))
    }
    const experience = gift.experience + wave.experience + graves.experience
    return [
        ...events,
        ...awardMasteries(
            actor,
            experience > 0
                ? [
                      {
                          constellationId: school.constellationId,
                          experience,
                      },
                  ]
                : [],
            {
                now: context.now,
                random: context.random,
                receiptId: castReceipt,
                factors,
                evidence:
                    abilityId === 'pray'
                        ? prayerEvidence(
                              gift.meaningful,
                              wave.meaningful,
                              graves.meaningful,
                              lowHpGift
                          )
                        : [],
            }
        ),
    ]
}

function prayerEvidence(
    gift: boolean,
    harm: boolean,
    purify: boolean,
    lowHpGift: boolean
): string[] {
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
    abilityId: PrayerAbilityId
): boolean {
    return (
        abilityId === 'pray' &&
        actor.hp < actor.maxHp * 0.2 &&
        actor.progression.constellations.hostileWound > 0 &&
        actor.progression.constellations.lowHpFromHostile
    )
}
function unansweredPrayer(
    actor: GameCharacter,
    abilityId: PrayerAbilityId
): GameEventPayload {
    return {
        kind: 'notice',
        actorId: actor.id,
        audienceIds: [actor.id],
        abilityId,
        text: 'Божество не ответило на просьбу. Мана потрачена.',
    }
}
