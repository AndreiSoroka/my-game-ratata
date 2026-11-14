import {
    type CharacterAutoAction as AnyAutoAction,
    type CharacterControlSnapshot,
    DEITY_PRAYER_PROFILES,
} from '@my-game-ratata/contracts'

type CharacterAutoAction = Exclude<
    AnyAutoAction,
    { kind: 'gather' | 'plant_tree' }
>

import type { AbilityContext } from './abilityContext'
import type { GameCharacter } from './character'
import { isTargetInAttackRange } from './combat'
import { canAttackCharacter } from './combatTargets'
import { companionProfiles } from './companionProfiles'
import { canTargetByFaction } from './factions'
import { distance } from './math'
import { prayerResourceMissing, validPrayerIntent } from './prayerContext'
import { visibilityRadius } from './queries'
import { canUseResurrection } from './skillProgression'
export function legalPrayerTarget(
    actor: GameCharacter,
    action: Extract<CharacterAutoAction, { kind: 'prayer' }>,
    target: GameCharacter,
    context: AbilityContext
): boolean {
    if (action.intent.mode === 'purify_grave') {
        return false
    }
    if (action.intent.mode === 'harm') {
        return (
            target.alive &&
            DEITY_PRAYER_PROFILES[actor.progression.patron].harmTypes.includes(
                target.creatureType
            ) &&
            actor.progression.skills.miracles.level >= 3
        )
    }
    if (action.intent.mode === 'revive') {
        return (
            !target.alive &&
            target.reviveUntil > context.now &&
            canUseResurrection(actor) &&
            target.faction === actor.faction &&
            DEITY_PRAYER_PROFILES[
                actor.progression.patron
            ].reviveTypes.includes(target.creatureType)
        )
    }
    return (
        target.alive &&
        !canTargetByFaction(actor, target, context.now) &&
        prayerResourceMissing(actor, target) >= 1
    )
}
export function untargetedAction(
    actor: GameCharacter,
    action: CharacterAutoAction,
    context: AbilityContext
): boolean | undefined {
    if (action.kind === 'prayer') {
        if (action.intent.mode === 'devotion') {
            return action.intent.targetId === undefined
        }
        if (
            action.intent.mode === 'harm' &&
            action.intent.targetId === undefined
        ) {
            return validPrayerIntent(actor, action.intent, context)
        }
    }
    if (action.kind === 'ability') {
        if (action.target !== undefined) {
            return undefined
        }
        if (action.abilityId === 'barrier') {
            return action.targetId === undefined
        }
        if (
            (action.abilityId === 'shot' || action.abilityId === 'spark') &&
            action.targetId === undefined
        ) {
            return true
        }
    }
    return undefined
}
export function visibleTarget(
    actor: GameCharacter,
    target: GameCharacter | undefined,
    context: AbilityContext
): target is GameCharacter {
    if (
        target === undefined ||
        target.tags.has('offline') ||
        target.tags.has('state.retired') ||
        target.locationId !== actor.locationId
    ) {
        return false
    }
    return (
        distance(actor.position, target.position) <=
            visibilityRadius(actor, target, 240, context.now) &&
        context.navigation.hasLineOfSight(actor.position, target.position)
    )
}
export function canFight(actor: GameCharacter): boolean {
    return (
        companionProfiles[actor.id]?.canFight !== false &&
        actor.soul.companion?.canFight !== false
    )
}

export function availableActor(actor: GameCharacter, now?: number): boolean {
    return (
        actor.alive &&
        !actor.tags.has('offline') &&
        !actor.tags.has('state.retired') &&
        (now === undefined || actor.stunUntil <= now)
    )
}
export function reachedTarget(
    actor: GameCharacter,
    target: GameCharacter,
    mode: CharacterControlSnapshot['mode'],
    tileSize: number
): boolean {
    return mode === 'attack'
        ? isTargetInAttackRange(actor, target, tileSize)
        : distance(actor.position, target.position) <= 28
}

export function allowedMode(
    actor: GameCharacter,
    target: GameCharacter,
    mode: CharacterControlSnapshot['mode'],
    now: number
): boolean {
    return mode === 'attack'
        ? canAttackCharacter(actor, target, now) && canFight(actor)
        : !canTargetByFaction(actor, target, now)
}
