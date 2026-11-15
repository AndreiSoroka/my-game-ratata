import {
    DEITY_PRAYER_PROFILES,
    type PrayerIntent,
    prayerManaCost,
    type PrayerPreview,
} from '@my-game-ratata/contracts'

import type { AbilityContext } from './abilityContext'
import { knowsAbility } from './abilityState'
import type { GameCharacter } from './character'
import { canTargetByFaction } from './factions'
import { canPurifyGrave } from './gravePrayer'
import { distance } from './math'
import { prayerParameters } from './prayerParameters'
import { canPerformSkillAction, canUseResurrection } from './skillProgression'

export function prayerResourceMissing(
    actor: GameCharacter,
    target: GameCharacter
): number {
    const profile = DEITY_PRAYER_PROFILES[actor.progression.patron]
    if (!target.alive || !profile.restoreTypes.includes(target.creatureType)) {
        return 0
    }
    if (profile.resource === 'hp') {
        return target.maxHp - target.hp
    }
    if (profile.resource === 'energy') {
        return target.config.resources.maxEnergy - target.energy
    }
    return target.config.resources.maxMana - target.mana
}
export function prayerTargetNearby(
    actor: GameCharacter,
    target: GameCharacter,
    context: AbilityContext
): boolean {
    return (
        !target.tags.has('offline') &&
        !target.tags.has('state.retired') &&
        target.locationId === actor.locationId &&
        distance(actor.position, target.position) <=
            prayerParameters(actor, context.navigation.grid.tileWidth).radius &&
        (actor.id === target.id ||
            context.navigation.hasLineOfSight(actor.position, target.position))
    )
}
export function revivalTargetEligible(
    actor: GameCharacter,
    target: GameCharacter,
    context: AbilityContext
): boolean {
    return (
        canUseResurrection(actor) &&
        !target.alive &&
        target.reviveUntil > context.now &&
        target.faction === actor.faction &&
        DEITY_PRAYER_PROFILES[actor.progression.patron].reviveTypes.includes(
            target.creatureType
        ) &&
        prayerTargetNearby(actor, target, context)
    )
}
export function prayerHarmTargets(
    actor: GameCharacter,
    context: AbilityContext
): GameCharacter[] {
    if (!prayerParameters(actor, context.navigation.grid.tileWidth).harm) {
        return []
    }
    const types = DEITY_PRAYER_PROFILES[actor.progression.patron].harmTypes
    const characters = new Map(
        context.characters.map((target) => [target.id, target])
    )
    characters.set(actor.id, actor)
    return [...characters.values()].filter(
        (target) =>
            target.alive &&
            types.includes(target.creatureType) &&
            prayerTargetNearby(actor, target, context)
    )
}
export function validPrayerIntent(
    actor: GameCharacter,
    intent: PrayerIntent,
    context: AbilityContext
): boolean {
    if (!knowsAbility(actor, 'pray')) {
        return false
    }
    if (intent.mode === 'purify_grave') {
        return canPurifyGrave(actor, intent.target.id, context)
    }
    if (intent.mode === 'devotion') {
        return intent.targetId === undefined
    }
    if (intent.mode === 'harm') {
        const targets = prayerHarmTargets(actor, context)
        return intent.targetId === undefined
            ? targets.length > 0
            : targets.some((target) => target.id === intent.targetId)
    }
    const target =
        intent.targetId === actor.id
            ? actor
            : context.characters.find(
                  (candidate) => candidate.id === intent.targetId
              )
    if (target === undefined) {
        return false
    }
    if (intent.mode === 'revive') {
        return revivalTargetEligible(actor, target, context)
    }
    return (
        target.alive &&
        !canTargetByFaction(actor, target, context.now) &&
        prayerTargetNearby(actor, target, context) &&
        prayerResourceMissing(actor, target) >= 1
    )
}
export function resolvePrayerIntent(
    actor: GameCharacter,
    context: AbilityContext,
    selectedTargetId?: string
): PrayerIntent {
    if (selectedTargetId !== undefined) {
        return (
            selectedPrayerIntent(actor, context, selectedTargetId) ?? {
                mode: 'devotion',
            }
        )
    }
    const ordered = [...context.characters].sort((a, b) => {
        const delta =
            distance(actor.position, a.position) -
            distance(actor.position, b.position)
        return delta === 0 ? a.id.localeCompare(b.id) : delta
    })
    for (const mode of ['revive', 'restore'] as const) {
        for (const target of ordered) {
            if (target.id === actor.id) {
                continue
            }
            const intent = { mode, targetId: target.id }
            if (validPrayerIntent(actor, intent, context)) {
                return intent
            }
        }
    }
    const self: PrayerIntent = { mode: 'restore', targetId: actor.id }
    if (validPrayerIntent(actor, self, context)) {
        return self
    }
    const grave = (context.graves?.list(actor.locationId) ?? [])
        .filter((candidate) => canPurifyGrave(actor, candidate.id, context))
        .sort((a, b) => {
            const delta =
                distance(actor.position, a.position) -
                distance(actor.position, b.position)
            return delta === 0 ? a.id.localeCompare(b.id) : delta
        })[0]
    if (grave !== undefined) {
        return { mode: 'purify_grave', target: { kind: 'grave', id: grave.id } }
    }
    return prayerHarmTargets(actor, context).length > 0
        ? { mode: 'harm' }
        : { mode: 'devotion' }
}
export function previewPrayer(
    actor: GameCharacter,
    context: AbilityContext,
    selectedTargetId?: string
): PrayerPreview {
    const intent = resolvePrayerIntent(actor, context, selectedTargetId)
    const targets =
        intent.mode === 'devotion' ? [] : prayerHarmTargets(actor, context)
    const manaCost = prayerManaCost(intent.mode)
    const parameters = prayerParameters(
        actor,
        context.navigation.grid.tileWidth
    )
    const unavailableReason = !knowsAbility(actor, 'pray')
        ? 'Молитва не изучена.'
        : !canPerformSkillAction(actor, context.now)
          ? 'Персонаж не может молиться сейчас.'
          : context.now <
              Math.max(
                  actor.progression.prayerAvailableAt,
                  actor.abilities.availableAt.pray ?? 0
              )
            ? 'Молитва восстанавливается.'
            : actor.mana < manaCost
              ? 'Недостаточно маны.'
              : null
    return {
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
        unavailableReason,
    }
}

function selectedPrayerIntent(
    actor: GameCharacter,
    context: AbilityContext,
    selectedTargetId: string
): PrayerIntent | undefined {
    if (canPurifyGrave(actor, selectedTargetId, context)) {
        return {
            mode: 'purify_grave',
            target: { kind: 'grave', id: selectedTargetId },
        }
    }
    for (const mode of ['revive', 'restore'] as const) {
        const intent = { mode, targetId: selectedTargetId }
        if (validPrayerIntent(actor, intent, context)) {
            return intent
        }
    }
    return prayerHarmTargets(actor, context).some(
        (target) => target.id === selectedTargetId
    )
        ? { mode: 'harm', targetId: selectedTargetId }
        : undefined
}

export function prayerGiftTargets(
    actor: GameCharacter,
    intent: PrayerIntent,
    context: AbilityContext
): GameCharacter[] {
    if (intent.mode === 'devotion' || intent.mode === 'revive') {
        return []
    }
    const area = prayerParameters(actor, context.navigation.grid.tileWidth).area
    const candidates = area
        ? [...context.characters, actor]
        : context.characters.filter(
              (target) =>
                  intent.mode === 'restore' && target.id === intent.targetId
          )
    if (!area && intent.mode === 'restore' && intent.targetId === actor.id) {
        candidates.push(actor)
    }
    return [
        ...new Map(candidates.map((target) => [target.id, target])).values(),
    ].filter(
        (target) =>
            target.alive &&
            !canTargetByFaction(actor, target, context.now) &&
            prayerTargetNearby(actor, target, context) &&
            prayerResourceMissing(actor, target) >= 1
    )
}
