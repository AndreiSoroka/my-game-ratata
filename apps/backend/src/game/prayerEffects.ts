import {
    type GameEventPayload,
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
    receiptId?: string
): GameEventPayload[] {
    if (intent.mode === 'devotion') {
        return []
    }
    // Capture modifiers and low-health evidence before any healing or learning.
    const modifiers = constellationModifiers(actor)
    const lowHpGift =
        actor.hp < actor.maxHp * 0.2 &&
        actor.progression.constellations.hostileWound > 0 &&
        actor.progression.constellations.lowHpFromHostile
    const castReceipt =
        receiptId ??
        `${actor.id}:prayer:${String(++actor.abilities.prayerSequence)}`
    const gift = applyPrayerGifts(
        actor,
        intent,
        context,
        roll < miracleChance(actor, context.now),
        quality * modifiers.prayerGiftMultiplier
    )
    const wave = applyPrayerWave(
        actor,
        context,
        roll,
        quality * modifiers.prayerHarmMultiplier
    )
    const graves = applyPrayerGraves(actor, intent, context, roll, castReceipt)
    const meaningful = gift.meaningful || wave.meaningful || graves.meaningful
    const attempted =
        gift.attemptMeaningful ||
        wave.attemptMeaningful ||
        graves.attemptMeaningful
    const events = [...gift.events, ...wave.events, ...graves.events]
    if (events.length === 0) {
        events.push({
            kind: 'notice',
            actorId: actor.id,
            audienceIds: [actor.id],
            abilityId: 'pray',
            text: 'Божество не ответило на просьбу. Мана потрачена.',
        })
    }
    return [
        ...events,
        ...practicePrayer(actor, context, {
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
        }),
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
    result: PrayerPractice
): GameEventPayload[] {
    const events: GameEventPayload[] = []
    const skillIds: SkillId[] = []
    if (result.attempted) {
        events.push(...trainSkill(actor, 'faith'))
        skillIds.push('faith')
    }
    if (result.meaningful) {
        events.push(...trainSkill(actor, 'miracles'))
        skillIds.push('miracles')
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
            evidence: result.evidence,
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
