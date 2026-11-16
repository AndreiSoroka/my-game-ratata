import {
    type GameEventPayload,
    livingCreatureTypes,
    MASTERY_REWARDS,
} from '@my-game-ratata/contracts'

import type { AbilityContext } from './abilityContext'
import { consumeHealingProvenance, type PrayerCast } from './abilityState'
import type { GameCharacter } from './character'
import { recordMartyrRecovery, resetMartyrStreak } from './martyr'
import { distance } from './math'
import type { MotherPrayerPlan } from './motherPrayerPlan'
import { awardMasteries } from './skillProgression'
import { recordVitalityRecovery } from './vitalityPractice'

/** Delayed simulation ticks consume each server deadline exactly once. */
export function advanceMotherPrayerTicks(
    actor: GameCharacter,
    cast: PrayerCast,
    context: AbilityContext
): GameEventPayload[] {
    const plan = cast.plan
    if (
        plan === undefined ||
        cast.mother?.aurasEnabled !== true ||
        !cast.mother.domain
    ) {
        return []
    }
    const events: GameEventPayload[] = []
    const recipients = [
        ...new Map(
            [...context.characters, actor].map((target) => [target.id, target])
        ).values(),
    ]
    const until = Math.min(context.now, cast.completesAt)
    while (
        plan.domainTick < 5 &&
        cast.startedAt + (plan.domainTick + 1) * 100 <= until
    ) {
        plan.domainTick += 1
        for (const target of recipients) {
            if (domainRecipient(actor, target, context, plan.radius)) {
                events.push(
                    ...healDomainRecipient(actor, target, cast, plan, context)
                )
            }
        }
    }
    return events
}

function domainRecipient(
    actor: GameCharacter,
    target: GameCharacter,
    context: AbilityContext,
    radius: number
): boolean {
    return (
        target.alive &&
        !target.tags.has('state.retired') &&
        livingCreatureTypes.includes(target.creatureType) &&
        target.locationId === actor.locationId &&
        distance(actor.position, target.position) <= radius &&
        (target === actor ||
            context.navigation.hasLineOfSight(actor.position, target.position))
    )
}

function healDomainRecipient(
    actor: GameCharacter,
    target: GameCharacter,
    cast: PrayerCast,
    plan: MotherPrayerPlan,
    context: AbilityContext
): GameEventPayload[] {
    const missing = Math.max(0, target.maxHp - target.hp)
    const amount = Math.min(1, missing)
    if (amount <= 0) {
        return []
    }
    const useful =
        target.trainingTarget === undefined &&
        consumeHealingProvenance(target, amount, missing) > 0
    target.hp += amount
    const events: GameEventPayload[] = recordVitalityRecovery(
        target,
        amount,
        context.now,
        target === actor,
        target === actor ? plan.factors : undefined
    )
    recordMartyrRecovery(target, actor.id)
    events.push({
        kind: 'heal',
        actorId: actor.id,
        targetId: target.id,
        amount,
        abilityId: cast.abilityId,
        text: 'hp',
    })
    if (!useful) {
        return events
    }
    if (target !== actor) {
        plan.otherMeaningful = true
        resetMartyrStreak(actor)
    }
    if (!plan.healedRecipients.has(target.id)) {
        plan.healedRecipients.add(target.id)
        events.push(
            ...awardMasteries(
                actor,
                [
                    {
                        constellationId: 'prayer',
                        experience: MASTERY_REWARDS.healing,
                    },
                ],
                {
                    now: context.now,
                    random: context.random,
                    factors: plan.factors,
                    receiptId: `${cast.receiptId}:heal:${target.id}`,
                    evidence: ['prayer', 'gift'],
                }
            )
        )
    }
    return events
}
