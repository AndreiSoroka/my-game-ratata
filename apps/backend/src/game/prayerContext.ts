import {
    type PrayerAbilityId,
    type PrayerIntent,
    profileForPrayer,
} from '@my-game-ratata/contracts'

import type { AbilityContext } from './abilityContext'
import { knowsAbility } from './abilityState'
import type { GameCharacter } from './character'
import { canTargetByFaction } from './factions'
import { canPurifyGrave } from './gravePrayer'
import { distance } from './math'
import { prayerParameters } from './prayerParameters'
import { canUseResurrection } from './skillProgression'

export { previewPrayer, resolvePrayerIntent } from './prayerSelection'

export function prayerResourceMissing(
    _actor: GameCharacter,
    target: GameCharacter,
    abilityId: PrayerAbilityId = 'pray'
): number {
    const profile = profileForPrayer(abilityId)
    if (!target.alive || !profile.restoreTypes.includes(target.creatureType)) {
        return 0
    }
    if (profile.resource === 'hp') {
        return target.maxHp - target.hp
    }
    return profile.resource === 'energy'
        ? target.config.resources.maxEnergy - target.energy
        : target.config.resources.maxMana - target.mana
}

export function prayerTargetNearby(
    actor: GameCharacter,
    target: GameCharacter,
    context: AbilityContext,
    abilityId: PrayerAbilityId = 'pray'
): boolean {
    return (
        !target.tags.has('offline') &&
        !target.tags.has('state.retired') &&
        target.locationId === actor.locationId &&
        distance(actor.position, target.position) <=
            prayerParameters(
                actor,
                context.navigation.grid.tileWidth,
                abilityId
            ).radius &&
        (actor.id === target.id ||
            context.navigation.hasLineOfSight(actor.position, target.position))
    )
}

export function revivalTargetEligible(
    actor: GameCharacter,
    target: GameCharacter,
    context: AbilityContext,
    abilityId: PrayerAbilityId = 'pray'
): boolean {
    return (
        canUseResurrection(actor, abilityId) &&
        !target.alive &&
        target.reviveUntil > context.now &&
        target.faction === actor.faction &&
        profileForPrayer(abilityId).reviveTypes.includes(target.creatureType) &&
        prayerTargetNearby(actor, target, context, abilityId)
    )
}

export function prayerHarmTargets(
    actor: GameCharacter,
    context: AbilityContext,
    abilityId: PrayerAbilityId = 'pray'
): GameCharacter[] {
    if (
        !prayerParameters(actor, context.navigation.grid.tileWidth, abilityId)
            .harm
    ) {
        return []
    }
    const types = profileForPrayer(abilityId).harmTypes
    const characters = new Map(
        [...context.characters, actor].map((target) => [target.id, target])
    )
    return [...characters.values()].filter(
        (target) =>
            target.alive &&
            types.includes(target.creatureType) &&
            prayerTargetNearby(actor, target, context, abilityId)
    )
}

export function validPrayerIntent(
    actor: GameCharacter,
    intent: PrayerIntent,
    context: AbilityContext,
    abilityId: PrayerAbilityId = 'pray'
): boolean {
    if (!knowsAbility(actor, abilityId)) {
        return false
    }
    if (intent.mode === 'purify_grave') {
        return (
            abilityId === 'pray' &&
            canPurifyGrave(actor, intent.target.id, context)
        )
    }
    if (intent.mode === 'devotion') {
        return intent.targetId === undefined
    }
    if (intent.mode === 'harm') {
        return validHarmPrayer(actor, intent.targetId, context, abilityId)
    }
    const target = prayerRecipient(actor, intent.targetId, context)
    if (target === undefined) {
        return false
    }
    if (intent.mode === 'revive') {
        return revivalTargetEligible(actor, target, context, abilityId)
    }
    return (
        target.alive &&
        !canTargetByFaction(actor, target, context.now) &&
        prayerTargetNearby(actor, target, context, abilityId) &&
        prayerResourceMissing(actor, target, abilityId) >= 1
    )
}

export function prayerGiftTargets(
    actor: GameCharacter,
    intent: PrayerIntent,
    context: AbilityContext,
    abilityId: PrayerAbilityId = 'pray'
): GameCharacter[] {
    if (intent.mode === 'devotion' || intent.mode === 'revive') {
        return []
    }
    const area = prayerParameters(
        actor,
        context.navigation.grid.tileWidth,
        abilityId
    ).area
    const candidates = area
        ? [...context.characters, actor]
        : [...context.characters, actor].filter(
              (target) =>
                  intent.mode === 'restore' && target.id === intent.targetId
          )
    return [
        ...new Map(candidates.map((target) => [target.id, target])).values(),
    ].filter(
        (target) =>
            target.alive &&
            !canTargetByFaction(actor, target, context.now) &&
            prayerTargetNearby(actor, target, context, abilityId) &&
            prayerResourceMissing(actor, target, abilityId) >= 1
    )
}

function validHarmPrayer(
    actor: GameCharacter,
    targetId: string | undefined,
    context: AbilityContext,
    abilityId: PrayerAbilityId
): boolean {
    const targets = prayerHarmTargets(actor, context, abilityId)
    return targetId === undefined
        ? targets.length > 0
        : targets.some((target) => target.id === targetId)
}

function prayerRecipient(
    actor: GameCharacter,
    targetId: string | undefined,
    context: AbilityContext
) {
    return targetId === actor.id
        ? actor
        : context.characters.find((candidate) => candidate.id === targetId)
}
