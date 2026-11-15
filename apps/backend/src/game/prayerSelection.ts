import {
    type PrayerAbilityId,
    type PrayerIntent,
    prayerManaCost,
    type PrayerPreview,
} from '@my-game-ratata/contracts'

import type { AbilityContext } from './abilityContext'
import { knowsAbility } from './abilityState'
import type { GameCharacter } from './character'
import { canPurifyGrave } from './gravePrayer'
import { distance } from './math'
import { prayerHarmTargets, validPrayerIntent } from './prayerContext'
import { prayerAvailableAt, prayerParameters } from './prayerParameters'
import { canPerformSkillAction } from './skillProgression'

export function resolvePrayerIntent(
    actor: GameCharacter,
    context: AbilityContext,
    selectedTargetId?: string,
    abilityId: PrayerAbilityId = 'pray'
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
    return prayerHarmTargets(actor, context, abilityId).length > 0
        ? { mode: 'harm' }
        : { mode: 'devotion' }
}

function nearbyPrayerGrave(
    actor: GameCharacter,
    context: AbilityContext,
    abilityId: PrayerAbilityId
) {
    if (abilityId !== 'pray') {
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
    abilityId: PrayerAbilityId = 'pray'
): PrayerPreview {
    const intent = resolvePrayerIntent(
        actor,
        context,
        selectedTargetId,
        abilityId
    )
    const targets =
        intent.mode === 'devotion'
            ? []
            : prayerHarmTargets(actor, context, abilityId)
    const parameters = prayerParameters(
        actor,
        context.navigation.grid.tileWidth,
        abilityId
    )
    const manaCost = prayerManaCost(intent.mode)
    return {
        abilityId,
        intent,
        manaCost,
        radius: parameters.radius,
        durationMs: intent.mode === 'devotion' ? 400 : parameters.durationMs,
        harmfulTargets: targets.length,
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
    abilityId: PrayerAbilityId
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
    abilityId: PrayerAbilityId
): PrayerIntent | undefined {
    if (abilityId === 'pray' && canPurifyGrave(actor, targetId, context)) {
        return { mode: 'purify_grave', target: { kind: 'grave', id: targetId } }
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
