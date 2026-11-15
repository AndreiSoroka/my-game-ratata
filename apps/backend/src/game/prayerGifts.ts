import {
    DEITY_PRAYER_PROFILES,
    type GameEventPayload,
    type PrayerIntent,
} from '@my-game-ratata/contracts'

import type { AbilityContext } from './abilityContext'
import { consumeHealingProvenance } from './abilityState'
import type { GameCharacter } from './character'
import { restoreCharacter } from './characterRecovery'
import { prayerGiftTargets, prayerResourceMissing } from './prayerContext'
import { recordVitalityRecovery } from './vitalityPractice'

export function applyPrayerGifts(
    actor: GameCharacter,
    intent: PrayerIntent,
    context: AbilityContext,
    succeeds: boolean,
    quality: number
) {
    const recipients =
        intent.mode === 'revive'
            ? context.characters.filter(
                  (target) => target.id === intent.targetId
              )
            : prayerGiftTargets(actor, intent, context)
    const events: GameEventPayload[] = []
    let meaningful = false
    let attemptMeaningful = false
    let selfRecovery = false
    for (const target of recipients) {
        attemptMeaningful ||= meaningfulGiftAttempt(actor, target, intent)
        if (!succeeds) {
            continue
        }
        const gift = applyGift(actor, target, intent, context.now, quality)
        events.push(...gift.events)
        meaningful ||= gift.meaningful
        selfRecovery ||= target.id === actor.id && gift.hpRecovery
    }
    return { events, meaningful, attemptMeaningful, selfRecovery }
}

function meaningfulGiftAttempt(
    actor: GameCharacter,
    target: GameCharacter,
    intent: PrayerIntent
): boolean {
    if (target.trainingTarget !== undefined) {
        return false
    }
    const missing =
        intent.mode === 'revive'
            ? target.maxHp
            : prayerResourceMissing(actor, target)
    return DEITY_PRAYER_PROFILES[actor.progression.patron].resource !== 'hp'
        ? missing > 0
        : missing - Math.min(missing, target.abilities.untrainableHpDamage) > 0
}

function applyGift(
    actor: GameCharacter,
    target: GameCharacter,
    intent: PrayerIntent,
    now: number,
    quality: number
) {
    if (intent.mode === 'revive') {
        return reviveGift(actor, target, intent, now)
    }
    const profile = DEITY_PRAYER_PROFILES[actor.progression.patron]
    const level = actor.progression.skills.miracles.level - 1
    const power =
        profile.resource === 'hp'
            ? 6 + level * 2
            : profile.resource === 'energy'
              ? 15 + level * 3
              : 12 + level * 2
    const missing = prayerResourceMissing(actor, target)
    const amount = Math.min(missing, Math.round(power * quality))
    if (amount <= 0) {
        return { events: [], meaningful: false, hpRecovery: false }
    }
    const lifeEvents: GameEventPayload[] = []
    let meaningful = target.trainingTarget === undefined
    if (profile.resource === 'hp') {
        meaningful =
            consumeHealingProvenance(target, amount, missing) > 0 && meaningful
        target.hp += amount
        lifeEvents.push(
            ...recordVitalityRecovery(target, amount, now, target === actor)
        )
    } else if (profile.resource === 'energy') {
        target.energy += amount
    } else {
        target.mana += amount
    }
    return {
        meaningful,
        hpRecovery: profile.resource === 'hp',
        events: [
            ...lifeEvents,
            {
                kind: 'heal' as const,
                actorId: actor.id,
                targetId: target.id,
                amount,
                abilityId: 'pray' as const,
                text: profile.resource,
            },
        ],
    }
}

function reviveGift(
    actor: GameCharacter,
    target: GameCharacter,
    intent: PrayerIntent,
    now: number
) {
    const meaningful = meaningfulGiftAttempt(actor, target, intent)
    const beforeHp = target.hp
    restoreCharacter(target, now, false)
    const lifeEvents = recordVitalityRecovery(
        target,
        target.hp - beforeHp,
        now,
        target === actor
    )
    return {
        meaningful,
        hpRecovery: target.hp > beforeHp,
        events: [
            ...lifeEvents,
            {
                actorId: actor.id,
                targetId: target.id,
                kind: 'revive' as const,
                abilityId: 'pray' as const,
            },
        ],
    }
}
