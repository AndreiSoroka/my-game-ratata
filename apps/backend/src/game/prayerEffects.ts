import {
    ASH_RULES,
    type GameEventPayload,
    PRAYER_SCHOOL_DEFINITIONS,
    type PrayerActionId,
    type PrayerIntent,
    prayerSchoolId,
} from '@my-game-ratata/contracts'

import type { AbilityContext } from './abilityContext'
import { nextPrayerReceipt, type RoadPrayerCastState } from './abilityState'
import type { GameCharacter } from './character'
import { ashParameters } from './constellationModifiers'
import { constellationModifiers } from './constellations'
import { ashHealingChance, miracleChance } from './deities'
import { effectiveMaxMana } from './effectiveResources'
import { resetMartyrStreak } from './martyr'
import { unansweredPrayer } from './prayerFeedback'
import { applyPrayerGifts } from './prayerGifts'
import { applyPrayerGraves } from './prayerGraves'
import { applyAshBrand, applyPrayerWave } from './prayerWave'
import { characterResurrectionParameters } from './resurrection'
import { awardMasteries, captureMasteryFactors } from './skillProgression'

type CompletedGift = ReturnType<typeof applyPrayerGifts>

/** Freeze modifiers and conflict factors before resolving the completed cast and its awards. */
export function completePrayer(
    actor: GameCharacter,
    intent: PrayerIntent,
    context: AbilityContext,
    roll: number,
    quality: number,
    receiptId?: string,
    abilityId: PrayerActionId = 'pray',
    road?: RoadPrayerCastState,
    secondaryTargetId?: string
): GameEventPayload[] {
    if (intent.mode === 'devotion') {
        return []
    }
    // Capture modifiers and low-health evidence before any healing or learning.
    const factors = captureMasteryFactors(actor)
    const resurrection =
        intent.mode === 'revive'
            ? characterResurrectionParameters(actor, abilityId, context.now)
            : undefined
    const lowHpGift = wasLowHpGift(actor, abilityId)
    const castReceipt = receiptId ?? nextPrayerReceipt(actor)
    const answered =
        roll <
        (resurrection?.successChance ??
            giftAnswerChance(actor, intent, abilityId, context.now))
    const gift = applyPrayerGifts(
        actor,
        intent,
        context,
        answered,
        quality * giftPower(actor, abilityId),
        abilityId,
        factors,
        resurrection,
        road,
        secondaryTargetId
    )
    const wave = resolveHarm(
        actor,
        intent,
        context,
        abilityId,
        roll,
        quality,
        answered
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
    applyAshHealingPerks(actor, abilityId, intent, gift, context.now)
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

function giftAnswerChance(
    actor: GameCharacter,
    intent: PrayerIntent,
    abilityId: PrayerActionId,
    now: number
): number {
    return abilityId === 'pray_grave' && intent.mode === 'restore'
        ? ashHealingChance(actor, now)
        : miracleChance(
              actor,
              now,
              PRAYER_SCHOOL_DEFINITIONS[prayerSchoolId(abilityId)].deityId
          )
}

function giftPower(actor: GameCharacter, abilityId: PrayerActionId): number {
    if (abilityId === 'pray') {
        return constellationModifiers(actor).prayerGiftMultiplier
    }
    return abilityId === 'pray_grave' ? ashParameters(actor).healPower : 1
}

function resolveHarm(
    actor: GameCharacter,
    intent: PrayerIntent,
    context: AbilityContext,
    abilityId: PrayerActionId,
    roll: number,
    quality: number,
    answered: boolean
) {
    return abilityId === 'pray_grave' && intent.mode === 'harm'
        ? applyAshBrand(actor, intent.targetId, context, answered, quality)
        : applyPrayerWave(
              actor,
              context,
              roll,
              quality * constellationModifiers(actor).prayerHarmMultiplier,
              abilityId
          )
}

function applyAshHealingPerks(
    actor: GameCharacter,
    abilityId: PrayerActionId,
    intent: PrayerIntent,
    gift: CompletedGift,
    now: number
): void {
    if (
        abilityId !== 'pray_grave' ||
        intent.mode !== 'restore' ||
        !gift.meaningful
    ) {
        return
    }
    const { dash, mana } = ashParameters(actor)
    if (dash) {
        actor.movement.ashPrayerDashUntil =
            now + ASH_RULES.dashDiscountDurationMs
    }
    if (
        mana &&
        gift.meaningfulAllyHeal &&
        now >= actor.progression.ashManaGiftAvailableAt
    ) {
        actor.mana = Math.min(
            effectiveMaxMana(actor),
            actor.mana + ASH_RULES.manaGift
        )
        actor.progression.ashManaGiftAvailableAt =
            now + ASH_RULES.manaGiftCooldownMs
    }
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
