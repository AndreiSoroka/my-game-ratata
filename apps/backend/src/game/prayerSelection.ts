import {
    ASH_RULES,
    isMotherPrayer,
    type PrayerActionId,
    type PrayerIntent,
    prayerManaCost,
    type PrayerParametersSnapshot,
    type PrayerPreview,
} from '@my-game-ratata/contracts'

import type { AbilityContext } from './abilityContext'
import { knowsAbility } from './abilityState'
import { planAshSecondaryHeal } from './ashPrayerTargets'
import type { GameCharacter } from './character'
import { constellationModifiers } from './constellationModifiers'
import { canPurifyGrave } from './gravePrayer'
import { distance } from './math'
import {
    hasMotherPrayerAura,
    motherPrayerCandidates,
    planMotherPrayer,
} from './motherPrayerPlan'
import {
    prayerHarmTargets,
    prayerResourceMissing,
    previewHarmTargets,
    validPrayerIntent,
} from './prayerContext'
import { prayerAvailableAt, prayerParameters } from './prayerParameters'
import { canPerformSkillAction } from './skillProgression'

export function resolvePrayerIntent(
    actor: GameCharacter,
    context: AbilityContext,
    selectedTargetId?: string,
    abilityId: PrayerActionId = 'pray'
): PrayerIntent {
    if (selectedTargetId !== undefined) {
        return (
            selectedPrayerIntent(
                actor,
                context,
                selectedTargetId,
                abilityId
            ) ?? { mode: 'devotion' }
        )
    }
    if (isMotherPrayer(abilityId)) {
        const target = motherPrayerCandidates(actor, context, abilityId)[0]
        return target === undefined
            ? { mode: 'devotion' }
            : target.kind === 'purify_grave'
              ? {
                    mode: 'purify_grave',
                    target: { kind: 'grave', id: target.id },
                }
              : { mode: target.kind, targetId: target.id }
    }
    const ordered = [...context.characters].sort((a, b) => {
        const delta =
            distance(actor.position, a.position) -
            distance(actor.position, b.position)
        return delta === 0 ? a.id.localeCompare(b.id) : delta
    })
    for (const mode of ['revive', 'restore'] as const) {
        const target = ordered.find(
            (candidate) =>
                candidate.id !== actor.id &&
                (abilityId !== 'pray_road' ||
                    prayerResourceMissing(actor, candidate, abilityId) >= 1) &&
                validPrayerIntent(
                    actor,
                    { mode, targetId: candidate.id },
                    context,
                    abilityId
                )
        )
        if (target !== undefined) {
            return { mode, targetId: target.id }
        }
    }
    const self: PrayerIntent = { mode: 'restore', targetId: actor.id }
    if (validPrayerIntent(actor, self, context, abilityId)) {
        return self
    }
    const grave = nearbyPrayerGrave(actor, context, abilityId)
    if (grave !== undefined) {
        return { mode: 'purify_grave', target: { kind: 'grave', id: grave.id } }
    }
    return automaticHarmIntent(actor, context, ordered, abilityId)
}

function automaticHarmIntent(
    actor: GameCharacter,
    context: AbilityContext,
    ordered: readonly GameCharacter[],
    abilityId: PrayerActionId
): PrayerIntent {
    const threats = prayerHarmTargets(actor, context, abilityId)
    if (abilityId === 'pray_grave') {
        const nearest = ordered.find((candidate) => threats.includes(candidate))
        return nearest === undefined
            ? { mode: 'devotion' }
            : { mode: 'harm', targetId: nearest.id }
    }
    return threats.length > 0 ? { mode: 'harm' } : { mode: 'devotion' }
}

function nearbyPrayerGrave(
    actor: GameCharacter,
    context: AbilityContext,
    abilityId: PrayerActionId
) {
    if (!isMotherPrayer(abilityId)) {
        return undefined
    }
    return (context.graves?.list(actor.locationId) ?? [])
        .filter((grave) => canPurifyGrave(actor, grave.id, context))
        .sort((a, b) => {
            const delta =
                distance(actor.position, a.position) -
                distance(actor.position, b.position)
            return delta === 0 ? a.id.localeCompare(b.id) : delta
        })[0]
}

export function previewPrayer(
    actor: GameCharacter,
    context: AbilityContext,
    selectedTargetId?: string,
    abilityId: PrayerActionId = 'pray'
): PrayerPreview {
    const intent = resolvePrayerIntent(
        actor,
        context,
        selectedTargetId,
        abilityId
    )
    const targets = previewHarmTargets(actor, context, intent, abilityId)
    const parameters = prayerParameters(
        actor,
        context.navigation.grid.tileWidth,
        abilityId,
        intent.mode
    )
    const baseCost = prayerManaCost(intent.mode, abilityId)
    const secondary =
        planAshSecondaryHeal(actor, intent, context, abilityId, baseCost) !==
        undefined
    const manaCost = baseCost + (secondary ? ASH_RULES.extraHealMana : 0)
    if (isMotherPrayer(abilityId)) {
        return previewMother(
            actor,
            context,
            intent,
            parameters,
            abilityId,
            selectedTargetId
        )
    }
    return {
        abilityId,
        intent,
        manaCost,
        radius: parameters.radius,
        durationMs: intent.mode === 'devotion' ? 400 : parameters.durationMs,
        harmfulTargets: targets.length,
        ...(abilityId !== 'pray_grave' || intent.mode === 'devotion'
            ? {}
            : { targetCount: secondary ? 2 : 1 }),
        includesSelf: targets.some((target) => target.id === actor.id),
        includesAllies: targets.some(
            (target) =>
                target.id !== actor.id && target.faction === actor.faction
        ),
        unavailableReason: prayerUnavailable(
            actor,
            context.now,
            manaCost,
            abilityId
        ),
    }
}

function prayerUnavailable(
    actor: GameCharacter,
    now: number,
    manaCost: number,
    abilityId: PrayerActionId
): string | null {
    if (!knowsAbility(actor, abilityId)) {
        return 'Молитва не изучена.'
    }
    if (
        !canPerformSkillAction(actor, now) ||
        actor.abilities.casting !== null
    ) {
        return 'Персонаж не может молиться сейчас.'
    }
    if (now < prayerAvailableAt(actor, abilityId)) {
        return 'Молитва восстанавливается.'
    }
    return actor.mana < manaCost ? 'Недостаточно маны.' : null
}

function selectedPrayerIntent(
    actor: GameCharacter,
    context: AbilityContext,
    targetId: string,
    abilityId: PrayerActionId
): PrayerIntent | undefined {
    if (isMotherPrayer(abilityId) && canPurifyGrave(actor, targetId, context)) {
        return { mode: 'purify_grave', target: { kind: 'grave', id: targetId } }
    }
    if (isMotherPrayer(abilityId)) {
        const target = motherPrayerCandidates(actor, context, abilityId).find(
            (candidate) =>
                candidate.id === targetId && candidate.kind !== 'purify_grave'
        )
        if (target !== undefined && target.kind !== 'purify_grave') {
            return { mode: target.kind, targetId }
        }
    }
    for (const mode of ['revive', 'restore'] as const) {
        const intent = { mode, targetId }
        if (validPrayerIntent(actor, intent, context, abilityId)) {
            return intent
        }
    }
    return prayerHarmTargets(actor, context, abilityId).some(
        (target) => target.id === targetId
    )
        ? { mode: 'harm', targetId }
        : undefined
}

function previewMother(
    actor: GameCharacter,
    context: AbilityContext,
    intent: PrayerIntent,
    parameters: PrayerParametersSnapshot,
    abilityId: PrayerActionId,
    selectedTargetId?: string
): PrayerPreview {
    const decorative = isDecorativePreview(actor, intent)
    const plan = planMotherPrayer(actor, intent, context, abilityId)
    const harmful =
        plan?.targets.filter((target) => target.kind === 'harm') ?? []
    return {
        abilityId,
        intent,
        manaCost: decorative ? 0 : 5,
        cost: parameters.cost ?? { manaPerTarget: 5 },
        radius: parameters.radius,
        durationMs: decorative ? 400 : parameters.durationMs,
        targetCount: plan?.targets.length ?? 0,
        harmfulTargets: harmful.length,
        harmfulTargetIds: harmful.map((target) => target.id),
        includesSelf: harmful.some((target) => target.id === actor.id),
        includesAllies: harmful.some(
            (target) =>
                context.characters.find(
                    (character) => character.id === target.id
                )?.faction === actor.faction
        ),
        unavailableReason: motherUnavailable(
            actor,
            context,
            abilityId,
            selectedTargetId,
            intent,
            decorative ? 0 : (plan?.manaCost ?? Number.POSITIVE_INFINITY)
        ),
    }
}

function isDecorativePreview(
    actor: GameCharacter,
    intent: PrayerIntent
): boolean {
    return (
        intent.mode === 'devotion' &&
        !hasMotherPrayerAura(actor) &&
        !constellationModifiers(actor).prayerLastLight
    )
}
function motherUnavailable(
    actor: GameCharacter,
    context: AbilityContext,
    action: PrayerActionId,
    selected: string | undefined,
    intent: PrayerIntent,
    cost: number
): string | null {
    return selected !== undefined &&
        selected !== actor.id &&
        intent.mode === 'devotion'
        ? 'Выбранная цель недоступна для этой молитвы.'
        : prayerUnavailable(actor, context.now, cost, action)
}
