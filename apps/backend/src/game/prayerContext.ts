import {
    DEITY_PRAYER_PROFILES,
    PRAYER_RULES,
    type PrayerIntent,
    type PrayerPreview,
    REVIVE_MANA_COST,
    REVIVE_RANGE,
} from '@my-game-ratata/contracts'

import type { AbilityContext } from './abilityContext'
import { knowsAbility } from './abilityState'
import type { GameCharacter } from './character'
import { canTargetByFaction } from './factions'
import { distance } from './math'
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
        distance(actor.position, target.position) <= REVIVE_RANGE &&
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
    if (actor.progression.skills.miracles.level < PRAYER_RULES.harmLevel) {
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
): PrayerIntent | undefined {
    if (selectedTargetId !== undefined) {
        return selectedPrayerIntent(actor, context, selectedTargetId)
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
    return prayerHarmTargets(actor, context).length > 0
        ? { mode: 'harm' }
        : undefined
}
export function previewPrayer(
    actor: GameCharacter,
    context: AbilityContext,
    selectedTargetId?: string
): PrayerPreview {
    const intent = resolvePrayerIntent(actor, context, selectedTargetId)
    const targets = prayerHarmTargets(actor, context)
    const manaCost = intent?.mode === 'revive' ? REVIVE_MANA_COST : 5
    const unavailableReason = !knowsAbility(actor, 'pray')
        ? 'Молитва не изучена.'
        : !canPerformSkillAction(actor, context.now)
          ? 'Персонаж не может молиться сейчас.'
          : context.now < actor.progression.prayerAvailableAt
            ? 'Молитва восстанавливается.'
            : intent === undefined
              ? 'Нет подходящей цели для молитвы.'
              : actor.mana < manaCost
                ? 'Недостаточно маны.'
                : null
    return {
        intent: intent ?? null,
        manaCost,
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
