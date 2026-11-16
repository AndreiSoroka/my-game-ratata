import {
    type GameEventPayload,
    MASTERY_REWARDS,
} from '@my-game-ratata/contracts'

import type { AbilityContext } from './abilityContext'
import type { PrayerCast } from './abilityState'
import type { GameCharacter } from './character'
import { recordMartyrPrayer } from './martyr'
import type { MotherPrayerPlan, MotherPrayerTarget } from './motherPrayerPlan'
import {
    type MotherTargetResult,
    resolveMotherTarget,
} from './motherPrayerResolution'
import { hasPrayerAdvantage, prayerAuraEffects } from './prayerAuras'
import { awardMasteries } from './skillProgression'
export { advanceMotherPrayerTicks } from './motherPrayerDomain'

/** All recipients share one miracle sample; Angelic gets a new check per revived soul. */
export function completeMotherPrayer(
    actor: GameCharacter,
    cast: PrayerCast,
    context: AbilityContext
): GameEventPayload[] {
    const plan = cast.plan
    if (plan === undefined) {
        return []
    }
    const random = context.random ?? Math.random
    const advantage = hasPrayerAdvantage(actor, context.now)
    const checkRandom = () =>
        advantage ? Math.min(random(), random()) : random()
    const hasMiracle = plan.targets.some((target) => target.kind !== 'ward')
    const roll = hasMiracle ? checkRandom() : 1
    const auras = new Map(
        [...context.characters, actor].map((target) => [
            target.id,
            prayerAuraEffects(target, context.now),
        ])
    )
    const events: GameEventPayload[] = []
    let experience = 0
    const evidence = new Set<string>(['prayer'])
    for (const target of plan.targets) {
        const result = resolveMotherTarget(
            actor,
            cast,
            plan,
            target,
            context,
            roll,
            checkRandom,
            auras.get(target.id)
        )
        events.push(...result.events)
        experience += recordResult(actor, plan, target, result, evidence)
    }
    events.push(
        ...finishMotherRewards(actor, cast, plan, context, experience, evidence)
    )
    if (events.length === 0 && hasMiracle) {
        events.push({
            kind: 'notice',
            actorId: actor.id,
            audienceIds: [actor.id],
            abilityId: cast.abilityId,
            text: 'Божество не ответило на просьбу. Мана потрачена.',
        })
    }
    return events
}

function recordResult(
    actor: GameCharacter,
    plan: MotherPrayerPlan,
    target: MotherPrayerTarget,
    result: MotherTargetResult,
    evidence: Set<string>
): number {
    if (!result.meaningful) {
        return 0
    }
    if (target.kind === 'restore') {
        evidence.add('gift')
        if (target.id === actor.id) {
            plan.selfHealed = true
        } else {
            plan.otherMeaningful = true
        }
        if (plan.healedRecipients.has(target.id)) {
            return 0
        }
        plan.healedRecipients.add(target.id)
        return MASTERY_REWARDS.healing
    }
    plan.otherMeaningful = true
    if (target.kind === 'harm') {
        evidence.add('harm')
    }
    if (target.kind === 'purify_grave') {
        evidence.add('purify')
    }
    return result.experience
}

function finishMotherRewards(
    actor: GameCharacter,
    cast: PrayerCast,
    plan: MotherPrayerPlan,
    context: AbilityContext,
    experience: number,
    evidence: Set<string>
): GameEventPayload[] {
    if (plan.lastLight && evidence.has('gift')) {
        evidence.add('low_hp_gift')
    }
    const events =
        cast.abilityId === 'pray'
            ? recordMartyrPrayer(
                  actor,
                  {
                      selfHealed: Number(plan.selfHealed),
                      otherMeaningful: plan.otherMeaningful,
                      receiptId: cast.receiptId,
                      levelBefore: plan.levelBefore,
                  },
                  context.now
              )
            : []
    events.push(
        ...awardMasteries(
            actor,
            experience > 0 ? [{ constellationId: 'prayer', experience }] : [],
            {
                now: context.now,
                random: context.random,
                receiptId: cast.receiptId,
                factors: plan.factors,
                evidence: [...evidence],
            }
        )
    )
    return events
}
