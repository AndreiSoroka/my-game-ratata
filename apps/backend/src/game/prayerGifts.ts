import {
    calculateResurrectionResources,
    type ConstellationId,
    type GameEventPayload,
    MASTERY_REWARDS,
    type PrayerAbilityId,
    type PrayerIntent,
    profileForPrayer,
    type ResurrectionParameters,
} from '@my-game-ratata/contracts'

import type { AbilityContext } from './abilityContext'
import { consumeHealingProvenance } from './abilityState'
import type { GameCharacter } from './character'
import { restoreCharacter } from './characterRecovery'
import { prayerGiftTargets, prayerResourceMissing } from './prayerContext'
import {
    consumeResourceRecovery,
    practiceResourceMissing,
} from './resourcePractice'
import { characterResurrectionParameters } from './resurrection'
import { recordVitalityRecovery } from './vitalityPractice'

export function applyPrayerGifts(
    actor: GameCharacter,
    intent: PrayerIntent,
    context: AbilityContext,
    succeeds: boolean,
    quality: number,
    abilityId: PrayerAbilityId = 'pray',
    factors?: Record<ConstellationId, number>,
    resurrection?: ResurrectionParameters
) {
    const recipients =
        intent.mode === 'revive'
            ? context.characters.filter(
                  (target) => target.id === intent.targetId
              )
            : prayerGiftTargets(actor, intent, context, abilityId)
    const events: GameEventPayload[] = []
    let meaningful = false
    let experience = 0
    for (const target of recipients) {
        if (!succeeds) {
            continue
        }
        const gift = applyPrayerGift(
            actor,
            target,
            intent,
            context.now,
            quality,
            abilityId,
            target === actor ? factors : undefined,
            resurrection,
            context.random
        )
        events.push(...gift.events)
        meaningful ||= gift.meaningful
        if (gift.meaningful) {
            experience +=
                intent.mode === 'revive'
                    ? MASTERY_REWARDS.resurrection
                    : profileForPrayer(abilityId).resource === 'hp'
                      ? MASTERY_REWARDS.healing
                      : MASTERY_REWARDS.resourceRecovery
        }
    }
    return { events, meaningful, experience }
}

function meaningfulGiftAttempt(
    actor: GameCharacter,
    target: GameCharacter,
    intent: PrayerIntent,
    abilityId: PrayerAbilityId
): boolean {
    if (target.trainingTarget !== undefined) {
        return false
    }
    const missing =
        intent.mode === 'revive'
            ? target.maxHp
            : prayerResourceMissing(actor, target, abilityId)
    const resource = profileForPrayer(abilityId).resource
    return resource !== 'hp'
        ? practiceResourceMissing(target, resource, missing) >= 1
        : missing - Math.min(missing, target.abilities.untrainableHpDamage) > 0
}

export function applyPrayerGift(
    actor: GameCharacter,
    target: GameCharacter,
    intent: PrayerIntent,
    now: number,
    quality: number,
    abilityId: PrayerAbilityId = 'pray',
    factors?: Record<ConstellationId, number>,
    resurrection?: ResurrectionParameters,
    random: () => number = Math.random
) {
    if (intent.mode === 'revive') {
        return reviveGift(
            actor,
            target,
            intent,
            now,
            abilityId,
            factors,
            resurrection,
            random
        )
    }
    const profile = profileForPrayer(abilityId)
    const power =
        profile.resource === 'hp' ? 6 : profile.resource === 'energy' ? 15 : 12
    const missing = prayerResourceMissing(actor, target, abilityId)
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
            ...recordVitalityRecovery(
                target,
                amount,
                now,
                target === actor,
                factors
            )
        )
    } else {
        meaningful =
            consumeResourceRecovery(
                target,
                profile.resource,
                amount,
                missing
            ) >= 1 && meaningful
        target[profile.resource] += amount
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
                abilityId,
                text: profile.resource,
            },
        ],
    }
}

function reviveGift(
    actor: GameCharacter,
    target: GameCharacter,
    intent: PrayerIntent,
    now: number,
    abilityId: PrayerAbilityId,
    factors?: Record<ConstellationId, number>,
    resurrection?: ResurrectionParameters,
    random: () => number = Math.random
) {
    if (target.alive) {
        return { meaningful: false, hpRecovery: false, events: [] }
    }
    const meaningful = meaningfulGiftAttempt(actor, target, intent, abilityId)
    const beforeHp = target.hp
    const parameters =
        resurrection ?? characterResurrectionParameters(actor, abilityId, now)
    const angelic =
        parameters.angelicChance > 0 && random() < parameters.angelicChance
    const resources = calculateResurrectionResources(
        parameters,
        {
            hp: target.maxHp,
            mana: target.config.resources.maxMana,
            energy: target.config.resources.maxEnergy,
        },
        angelic
    )
    restoreCharacter(target, now, false, resources)
    const lifeEvents = recordVitalityRecovery(
        target,
        target.hp - beforeHp,
        now,
        target === actor,
        factors
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
                abilityId,
            },
        ],
    }
}
