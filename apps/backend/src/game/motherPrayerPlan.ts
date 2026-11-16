import {
    type ConstellationId,
    type PrayerActionId,
    type PrayerIntent,
    type ResurrectionParameters,
} from '@my-game-ratata/contracts'

import type { AbilityContext } from './abilityContext'
import type { GameCharacter } from './character'
import { constellationModifiers } from './constellationModifiers'
import { deityMood, miracleChance } from './deities'
import { effectiveMaxMana } from './effectiveResources'
import {
    affordableMotherPrayerTargets,
    type MotherPrayerTarget,
    selectMotherPrayerTargets,
} from './motherPrayerTargets'
import type { MotherPrayerAuraState } from './prayerAuras'
import { prayerParameters } from './prayerParameters'
import { prayerMoodQuality } from './prayerProbability'
import { characterResurrectionParameters } from './resurrection'
import { captureMasteryFactors } from './skillProgression'

export type { MotherPrayerTarget } from './motherPrayerTargets'
export { motherPrayerCandidates } from './motherPrayerTargets'

/** Private, immutable choices for a single paid application; progress fields are receipts. */
export interface MotherPrayerPlan {
    resolving?: boolean
    targets: readonly MotherPrayerTarget[]
    manaCost: number
    radius: number
    durationMs: number
    giftMultiplier: number
    harmMultiplier: number
    answerChance: number
    quality: number
    resurrection: ResurrectionParameters
    factors: Record<ConstellationId, number>
    levelBefore: number
    lastLight: boolean
    auraOnly: boolean
    healedRecipients: Set<string>
    domainTick: number
    selfHealed: boolean
    otherMeaningful: boolean
}
export interface MotherPrayerCastState extends MotherPrayerAuraState {
    lastLight: boolean
}

export function hasMotherPrayerAura(actor: GameCharacter): boolean {
    const modifiers = constellationModifiers(actor)
    return (
        modifiers.prayerWardRank > 0 ||
        modifiers.prayerAuraProtection ||
        modifiers.prayerAuraBlessing ||
        modifiers.prayerAuraDomain
    )
}

/** Validation is read-only: previews and auto controllers use exactly the paid target budget. */
export function planMotherPrayer(
    actor: GameCharacter,
    intent: PrayerIntent,
    context: AbilityContext,
    action: PrayerActionId
): MotherPrayerPlan | undefined {
    const parameters = prayerParameters(
        actor,
        context.navigation.grid.tileWidth,
        action
    )
    const modifiers = constellationModifiers(actor)
    const lastLight = modifiers.prayerLastLight
    const selected = selectMotherPrayerTargets(
        actor,
        intent,
        context,
        action,
        lastLight
    )
    if (selected === undefined) {
        return undefined
    }
    const allocation = affordableMotherPrayerTargets(selected.ordered, {
        mana: actor.mana,
        maxMana: effectiveMaxMana(actor),
        lastLight,
        selfId: actor.id,
        limit: modifiers.targetLimit,
    })
    if (
        allocation === undefined ||
        (selected.chosen !== undefined && allocation.targets.length === 0)
    ) {
        return undefined
    }
    const auraOnly = allocation.targets.length === 0
    if (auraOnly && (!hasMotherPrayerAura(actor) || actor.mana < 5)) {
        return undefined
    }
    return {
        ...allocation,
        ...frozenPrayerProfile(actor, context, action, parameters, modifiers),
        manaCost: auraOnly ? 5 : allocation.manaCost,
        lastLight,
        auraOnly,
        healedRecipients: new Set(),
        domainTick: 0,
        selfHealed: false,
        otherMeaningful: false,
    }
}

function frozenPrayerProfile(
    actor: GameCharacter,
    context: AbilityContext,
    action: PrayerActionId,
    parameters: ReturnType<typeof prayerParameters>,
    modifiers: ReturnType<typeof constellationModifiers>
) {
    return {
        radius: parameters.radius,
        durationMs: parameters.durationMs,
        giftMultiplier: modifiers.prayerGiftMultiplier,
        harmMultiplier: modifiers.prayerHarmMultiplier,
        answerChance: miracleChance(actor, context.now, 'hearth'),
        quality: prayerMoodQuality[deityMood('hearth', context.now)],
        resurrection: characterResurrectionParameters(
            actor,
            action,
            context.now
        ),
        factors: captureMasteryFactors(actor),
        levelBefore: actor.progression.masteries.prayer.level,
    }
}

export function motherPrayerAuraState(
    actor: GameCharacter,
    plan: MotherPrayerPlan
): MotherPrayerCastState {
    const modifiers = constellationModifiers(actor)
    return {
        radius: plan.radius,
        wardRank: modifiers.prayerWardRank,
        wardTargetIds: plan.targets
            .filter(
                (target) => target.kind === 'harm' || target.kind === 'ward'
            )
            .map((target) => target.id),
        protection: modifiers.prayerAuraProtection,
        blessing: modifiers.prayerAuraBlessing,
        domain: modifiers.prayerAuraDomain,
        absolute: modifiers.prayerAbsoluteConcentration,
        concentrationChance: modifiers.prayerConcentrationChance,
        aurasEnabled: !actor.abilities.prayerAurasSuppressed,
        lastLight: plan.lastLight,
    }
}
