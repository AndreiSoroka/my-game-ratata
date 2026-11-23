import {
    type CharacterAutoAction as AnyAutoAction,
    type CharacterControlSnapshot,
    type PrayerActionId,
    profileForPrayer,
} from '@my-game-ratata/contracts'

type CharacterAutoAction = Exclude<
    AnyAutoAction,
    { kind: 'gather' | 'plant_tree' }
>

import type { AbilityContext } from './abilityContext'
import type { GameCharacter } from './character'
import { canObserveRoomCharacter } from './characterSight'
import { isTargetInAttackRange } from './combat'
import { canUseCombat } from './combatPermission'
import { canAttackCharacter, hasAttackRelationship } from './combatTargets'
import { companionProfiles } from './companionProfiles'
import { canTargetByFaction } from './factions'
import { distance } from './math'
import { prayerResourceMissing, validPrayerIntent } from './prayerContext'
import { prayerParameters } from './prayerParameters'
import { visibilityRadius } from './queries'
import { canUseResurrection } from './skillProgression'
export function legalPrayerTarget(
    actor: GameCharacter,
    action: Extract<CharacterAutoAction, { kind: 'prayer' }>,
    target: GameCharacter,
    context: AbilityContext
): boolean {
    const abilityId = action.abilityId ?? 'pray'
    if (action.intent.mode === 'purify_grave') {
        return false
    }
    if (action.intent.mode === 'ward') {
        return target.alive && target.creatureType === 'undead'
    }
    if (action.intent.mode === 'harm') {
        return (
            target.alive &&
            (abilityId === 'pray_grave'
                ? hasAttackRelationship(actor, target, context.now)
                : profileForPrayer(abilityId).harmTypes.includes(
                      target.creatureType
                  )) &&
            prayerParameters(
                actor,
                context.navigation.grid.tileWidth,
                abilityId
            ).harm
        )
    }
    if (action.intent.mode === 'revive') {
        return legalRevivalTarget(actor, target, context.now, abilityId)
    }

    return (
        target.alive &&
        !canTargetByFaction(actor, target, context.now) &&
        prayerResourceMissing(actor, target, abilityId) >= 1
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
            spatialPrayerMode(action.intent.mode) &&
            action.intent.targetId === undefined
        ) {
            return validPrayerIntent(
                actor,
                action.intent,
                context,
                action.abilityId ?? 'pray'
            )
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
    context: Pick<AbilityContext, 'navigation' | 'now'>
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
        canObserveRoomCharacter(
            actor,
            target,
            context.navigation,
            context.now
        ) &&
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
        ? canAttackCharacter(actor, target, now) && canUseCombat(actor)
        : !canTargetByFaction(actor, target, now)
}

function legalRevivalTarget(
    actor: GameCharacter,
    target: GameCharacter,
    now: number,
    abilityId: PrayerActionId
): boolean {
    return (
        !target.alive &&
        target.reviveUntil > now &&
        canUseResurrection(actor, abilityId) &&
        target.faction === actor.faction &&
        profileForPrayer(abilityId).reviveTypes.includes(target.creatureType)
    )
}

function spatialPrayerMode(mode: string): boolean {
    return mode === 'harm' || mode === 'ward'
}
