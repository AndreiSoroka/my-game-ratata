import {
    type GameEventPayload,
    PRAYER_SCHOOL_DEFINITIONS,
    type PrayerAbilityId,
    type PrayerIntent,
    type SkillId,
} from '@my-game-ratata/contracts'

import type { AbilityContext } from './abilityContext'
import type { GameCharacter } from './character'
import {
    constellationModifiers,
    finishConstellationAction,
} from './constellations'
import { miracleChance } from './deities'
import { applyPrayerGifts } from './prayerGifts'
import { applyPrayerGraves } from './prayerGraves'
import { applyPrayerWave } from './prayerWave'
import { trainSkill } from './skillProgression'

/** One completed cast, one random sample, one practice award per relevant skill. */
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
    const modifiers = constellationModifiers(actor)
    const lowHpGift = wasLowHpGift(actor, abilityId)
    const castReceipt =
        receiptId ??
        `${actor.id}:prayer:${String(++actor.abilities.prayerSequence)}`
    const gift = applyPrayerGifts(
        actor,
        intent,
        context,
        roll <
            miracleChance(
                actor,
                context.now,
                PRAYER_SCHOOL_DEFINITIONS[abilityId].deityId
            ),
        quality * (abilityId === 'pray' ? modifiers.prayerGiftMultiplier : 1),
        abilityId
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
    const meaningful = gift.meaningful || wave.meaningful || graves.meaningful
    const attempted =
        gift.attemptMeaningful ||
        wave.attemptMeaningful ||
        graves.attemptMeaningful
    const events = [...gift.events, ...wave.events, ...graves.events]
    if (events.length === 0) {
        events.push(unansweredPrayer(actor, abilityId))
    }

    return [
        ...events,
        ...practicePrayer(
            actor,
            context,
            {
                attempted,
                meaningful,
                selfRecovery: gift.selfRecovery,
                evidence: prayerEvidence(
                    gift.meaningful,
                    wave.meaningful,
                    graves.meaningful,
                    lowHpGift
                ),
                receiptId: castReceipt,
            },
            abilityId
        ),
    ]
}

interface PrayerPractice {
    attempted: boolean
    meaningful: boolean
    selfRecovery: boolean
    evidence: string[]
    receiptId: string
}

function practicePrayer(
    actor: GameCharacter,
    context: AbilityContext,
    result: PrayerPractice,
    abilityId: PrayerAbilityId
): GameEventPayload[] {
    const events: GameEventPayload[] = []
    const skillIds: SkillId[] = []
    const school = PRAYER_SCHOOL_DEFINITIONS[abilityId]
    if (result.attempted) {
        events.push(...trainSkill(actor, school.faithSkillId))
        skillIds.push(school.faithSkillId)
    }
    if (result.meaningful) {
        events.push(...trainSkill(actor, school.miracleSkillId))
        skillIds.push(school.miracleSkillId)
    }
    if (result.selfRecovery) {
        skillIds.push('vitality')
    }
    if (skillIds.length === 0) {
        return events
    }
    return [
        ...events,
        ...finishConstellationAction(actor, {
            skillIds,
            now: context.now,
            random: context.random,
            actionId: result.receiptId,
            evidence: abilityId === 'pray' ? result.evidence : [],
        }),
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
