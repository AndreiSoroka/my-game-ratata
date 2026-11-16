import {
    type GameEventPayload,
    MASTERY_REWARDS,
} from '@my-game-ratata/contracts'

import type { AbilityContext } from './abilityContext'
import { resolveCharacterDamage } from './abilityDamage'
import type { PrayerCast } from './abilityState'
import type { GameCharacter } from './character'
import { canPurifyGrave } from './gravePrayer'
import { distance } from './math'
import type { MotherPrayerPlan, MotherPrayerTarget } from './motherPrayerPlan'
import { type PrayerAuraEffects, prayerAuraEffects } from './prayerAuras'
import { revivalTargetEligible } from './prayerContext'
import { applyPrayerGift } from './prayerGifts'
import { prayerHarmChance, prayerPurificationChance } from './prayerProbability'

export interface MotherTargetResult {
    events: GameEventPayload[]
    meaningful: boolean
    experience: number
}
const empty = (): MotherTargetResult => ({
    events: [],
    meaningful: false,
    experience: 0,
})

export function resolveMotherTarget(
    actor: GameCharacter,
    cast: PrayerCast,
    plan: MotherPrayerPlan,
    recipient: MotherPrayerTarget,
    context: AbilityContext,
    roll: number,
    checkRandom: () => number,
    auras?: PrayerAuraEffects
): MotherTargetResult {
    if (recipient.kind === 'purify_grave') {
        return resolveGrave(actor, cast, plan, recipient.id, context, roll)
    }
    const target = findRecipient(actor, recipient, plan, context)
    if (target === undefined || recipient.kind === 'ward') {
        return empty()
    }
    if (recipient.kind === 'harm') {
        return resolveHarm(actor, target, cast, plan, context, roll, auras)
    }
    return resolveGift(
        actor,
        target,
        cast,
        plan,
        recipient.kind,
        context,
        roll,
        checkRandom
    )
}

function findRecipient(
    actor: GameCharacter,
    recipient: MotherPrayerTarget,
    plan: MotherPrayerPlan,
    context: AbilityContext
): GameCharacter | undefined {
    const target =
        recipient.id === actor.id
            ? actor
            : context.characters.find(
                  (candidate) => candidate.id === recipient.id
              )
    if (
        target === undefined ||
        target.tags.has('state.retired') ||
        target.locationId !== actor.locationId
    ) {
        return undefined
    }
    if (target.tags.has('offline') && !(target === actor && plan.lastLight)) {
        return undefined
    }
    if (distance(actor.position, target.position) > plan.radius) {
        return undefined
    }
    return target === actor ||
        context.navigation.hasLineOfSight(actor.position, target.position)
        ? target
        : undefined
}

function resolveGrave(
    actor: GameCharacter,
    cast: PrayerCast,
    plan: MotherPrayerPlan,
    id: string,
    context: AbilityContext,
    roll: number
): MotherTargetResult {
    if (
        !canPurifyGrave(actor, id, context) ||
        roll >= prayerPurificationChance(plan.answerChance)
    ) {
        return empty()
    }
    const contribution = context.graves?.contributePurification(
        id,
        cast.receiptId,
        context.now
    )
    if (contribution?.accepted !== true) {
        return empty()
    }
    return {
        meaningful: true,
        experience: contribution.purified
            ? MASTERY_REWARDS.graveFinal
            : MASTERY_REWARDS.graveStep,
        events: [
            {
                kind: contribution.purified
                    ? 'grave_purified'
                    : 'grave_purification_progress',
                actorId: actor.id,
                abilityId: cast.abilityId,
                target: { kind: 'grave', id },
            },
        ],
    }
}

function resolveHarm(
    actor: GameCharacter,
    target: GameCharacter,
    cast: PrayerCast,
    plan: MotherPrayerPlan,
    context: AbilityContext,
    roll: number,
    auras?: PrayerAuraEffects
): MotherTargetResult {
    if (
        prayerAuraEffects(actor, context.now).feared ||
        !target.alive ||
        target.creatureType !== 'undead' ||
        roll >= prayerHarmChance(plan.answerChance)
    ) {
        return empty()
    }
    const damage = resolveCharacterDamage({
        actor,
        target,
        amount: Math.round(6 * plan.quality * plan.harmMultiplier),
        now: context.now,
        damageKind: 'holy',
        respawnDelayMs: context.respawnDelayMsFor?.(target) ?? 15000,
        ...(auras === undefined ? {} : { targetAuraEffects: auras }),
        ...(context.random === undefined ? {} : { random: context.random }),
    })
    return {
        events: damage.events.map((event) => ({
            ...event,
            abilityId: cast.abilityId,
        })),
        meaningful: damage.trainableDamage > 0,
        experience: damage.trainableDamage > 0 ? MASTERY_REWARDS.prayerHarm : 0,
    }
}

function resolveGift(
    actor: GameCharacter,
    target: GameCharacter,
    cast: PrayerCast,
    plan: MotherPrayerPlan,
    kind: 'restore' | 'revive',
    context: AbilityContext,
    roll: number,
    checkRandom: () => number
): MotherTargetResult {
    const revive = kind === 'revive'
    if (
        revive &&
        !revivalTargetEligible(actor, target, context, cast.abilityId)
    ) {
        return empty()
    }
    if (
        roll >= (revive ? plan.resurrection.successChance : plan.answerChance)
    ) {
        return empty()
    }
    const gift = applyPrayerGift(
        actor,
        target,
        { mode: kind, targetId: target.id },
        context.now,
        plan.quality * plan.giftMultiplier,
        cast.abilityId,
        target === actor ? plan.factors : undefined,
        plan.resurrection,
        checkRandom
    )
    return {
        events: gift.events,
        meaningful: gift.meaningful,
        experience:
            revive && gift.meaningful ? MASTERY_REWARDS.resurrection : 0,
    }
}
