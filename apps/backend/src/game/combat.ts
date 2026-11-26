import {
    type AttackGeometry,
    type GameEventPayload,
    isItemBroken,
    type Vector2,
    type WorldCombatTarget,
} from '@my-game-ratata/contracts'

import { ashTargetCastInProgress } from './abilityState'
import type { GameCharacter } from './character'
import { canObserveRoomCharacter } from './characterSight'
import type { PendingAttackHit } from './characterState'
import type { CityPortals } from './cityPortals'
import {
    arrowAttackGeometry,
    arrowPhaseEvent,
    canAimSniperAt,
} from './combatArchery'
import { resolveContactBatch } from './combatContacts'
import {
    buildAttackZones,
    isInAttackGeometry,
    isInZones,
} from './combatGeometry'
import { sparkPhaseEvent } from './combatInterruption'
import { releaseAttackProjectiles } from './combatProjectileRelease'
import { pendingWallContact } from './combatSecretWalls'
import { canAttackCharacter } from './combatTargets'
import type { DungeonSecrets } from './dungeonSecrets'
import { findGraveHit, legalGraveTarget } from './graveCombat'
import type { GraveCombatContext } from './graveRules'
import { usesAttackWeapon } from './itemDurability'
import { activeMagicChannel, magicAttackWindingUp } from './magicState'
import { distance } from './math'
import type { NavigationService } from './navigation'
import { prayerAuraEffects } from './prayerAuras'
export { attemptAbilityAttack, attemptAttack } from './combatAttack'

export interface AttackContext {
    actor: GameCharacter
    target?: WorldCombatTarget | undefined
    graves?: GraveCombatContext | undefined
    secrets?: DungeonSecrets | undefined
    portals?: Pick<CityPortals, 'snapshot'> | undefined
    now: number
    respawnDelayMsFor: (target: GameCharacter) => number
    targets: readonly GameCharacter[]
    tileSize: number
    targetId?: string | undefined
    navigation?: NavigationService
    random?: () => number
}
export function resolvePendingAttackHit(
    context: AttackContext
): GameEventPayload[] {
    const { actor, now } = context
    const attack = actor.consumePendingAttackHit(now)
    if (attack === undefined) {
        return []
    }
    if (!availableToAttack(actor, now) || !validPendingWeapon(actor, attack)) {
        return interruptedAttack(actor, attack)
    }
    const geometry = pendingGeometry(context, attack)
    const area = isAreaAttack(attack)
    const targets = characterContacts(context, attack, geometry, area)
    const graves = area
        ? graveContacts(context, geometry)
        : singleGrave(context, attack, targets[0])
    if (graves.length > 0 && !area) {
        targets.length = 0
    }
    const contact = targets[0] ?? graves[0]
    const wallId = pendingWallContact(context, attack, geometry, contact, area)
    const release = releaseAttackProjectiles(context, attack, contact)
    const contacts =
        contact === undefined && wallId === undefined
            ? []
            : resolveContactBatch(context, attack, targets, graves, { wallId })
    return contact === undefined && contacts.length === 0
        ? [...release, missedAttack(actor, attack)]
        : [...release, ...contacts]
}
function interruptedAttack(
    actor: GameCharacter,
    attack: PendingAttackHit
): GameEventPayload[] {
    if (attack.sparkPath !== undefined) {
        return [sparkPhaseEvent(actor, attack, 'interrupted')]
    }
    return attack.arrow !== undefined
        ? [arrowPhaseEvent(actor, attack, 'interrupted')]
        : []
}
function isAreaAttack(attack: PendingAttackHit): boolean {
    return (
        attack.abilityId === 'wide_swing' ||
        attack.abilityId === 'circular_swing'
    )
}
function pendingGeometry(
    context: AttackContext,
    attack: PendingAttackHit
): AttackGeometry {
    const { actor } = context
    if (attack.abilityId === 'lunge') {
        actor.attackZones = buildAttackZones(actor, context.tileSize)
        attack.geometry = { kind: 'rectangles', zones: actor.attackZones }
        if (actor.combat.action !== undefined) {
            actor.combat.action.geometry = attack.geometry
        }
    } else if (attack.arrow?.mobile === true) {
        attack.geometry = arrowAttackGeometry(actor, attack.arrow)
        if (attack.geometry.kind === 'rectangles') {
            actor.attackZones = attack.geometry.zones
        }
        if (actor.combat.action !== undefined) {
            actor.combat.action.geometry = attack.geometry
        }
    }
    return attack.geometry ?? { kind: 'rectangles', zones: actor.attackZones }
}
function characterContacts(
    context: AttackContext,
    attack: PendingAttackHit,
    geometry: AttackGeometry,
    area: boolean
): GameCharacter[] {
    if (attack.target !== undefined && !area) {
        return []
    }
    const { actor } = context
    const origin = attack.sparkPath?.origin ?? actor.position
    const candidates = [
        ...new Map(
            context.targets.map((target) => [target.id, target])
        ).values(),
    ].filter(
        (target) =>
            (area ||
                attack.targetId === undefined ||
                target.id === attack.targetId) &&
            legalContactTarget(context, attack, target, area) &&
            isInAttackGeometry(target.position, geometry)
    )
    candidates.sort(
        (a, b) => distance(origin, a.position) - distance(origin, b.position)
    )
    return area ? candidates : candidates.slice(0, 1)
}
function legalContactTarget(
    context: AttackContext,
    attack: PendingAttackHit,
    target: GameCharacter,
    area: boolean
): boolean {
    const targetedContext = {
        ...context,
        targetId: area ? undefined : attack.targetId,
    }
    if (area) {
        return isAttackContactAvailable(context.actor, target, targetedContext)
    }
    return attack.arrow?.abilityId === 'sniper_shot'
        ? canAimSniperAt(targetedContext, target, attack.arrow.origin)
        : isLegalAttackTarget(
              context.actor,
              target,
              targetedContext,
              attack.sparkPath?.origin
          )
}
function graveContacts(context: AttackContext, geometry: AttackGeometry) {
    return (context.graves?.list(context.actor.locationId) ?? []).filter(
        (grave) =>
            legalGraveTarget(context.actor, grave, context.navigation) &&
            isInAttackGeometry(grave.position, geometry)
    )
}
function singleGrave(
    context: AttackContext,
    attack: PendingAttackHit,
    target?: GameCharacter
) {
    const grave = findGraveHit(context, attack)
    const origin = attack.sparkPath?.origin ?? context.actor.position
    return grave !== undefined &&
        (target === undefined ||
            distance(origin, grave.position) <
                distance(origin, target.position))
        ? [grave]
        : []
}
function missedAttack(
    actor: GameCharacter,
    attack: PendingAttackHit
): GameEventPayload {
    return {
        kind: 'miss',
        hitQuality: 'miss',
        actorId: actor.id,
        ...(attack.targetId === undefined ? {} : { targetId: attack.targetId }),
        ...(attack.target === undefined
            ? {}
            : { target: { ...attack.target } }),
        ...(attack.abilityId === undefined
            ? {}
            : { abilityId: attack.abilityId }),
        ...(attack.actionId === undefined ? {} : { actionId: attack.actionId }),
        ...(attack.origin === undefined ? {} : { attackOrigin: attack.origin }),
    }
}
function validPendingWeapon(
    actor: GameCharacter,
    attack: PendingAttackHit
): boolean {
    return (
        !usesAttackWeapon(attack) ||
        (attack.weaponInstanceId === actor.equipment.weapon?.instanceId &&
            (actor.equipment.weapon === undefined ||
                !isItemBroken(actor.equipment.weapon)))
    )
}
export function isTargetInAttackRange(
    actor: GameCharacter,
    target: { position: Vector2 },
    tileSize: number
): boolean {
    return isInZones(target, buildAttackZones(actor, tileSize))
}
/** A due contact cannot be overwritten by a later input, even after its movement phase. */
export function availableToStartAttack(
    actor: GameCharacter,
    now: number
): boolean {
    return (
        availableToAttack(actor, now) &&
        !actor.isActionLocked(now) &&
        actor.combat.readyAt <= now &&
        actor.pendingAttack === undefined &&
        !actor.combat.defensiveStance &&
        !magicAttackWindingUp(actor) &&
        !ashTargetCastInProgress(actor) &&
        activeMagicChannel(actor, now) === undefined &&
        actor.abilities.casting === null
    )
}
export function availableToAttack(actor: GameCharacter, now: number): boolean {
    return (
        actor.alive &&
        actor.trainingTarget === undefined &&
        !actor.tags.has('offline') &&
        !actor.tags.has('state.retired') &&
        actor.stunUntil <= now &&
        !prayerAuraEffects(actor, now).feared
    )
}
export function isLegalAttackTarget(
    actor: GameCharacter,
    target: GameCharacter,
    context: AttackContext,
    origin = actor.position
): boolean {
    return (
        canAttackCharacter(actor, target, context.now) &&
        isAttackContactAvailable(actor, target, context, origin)
    )
}

export function isAttackContactAvailable(
    actor: GameCharacter,
    target: GameCharacter,
    context: AttackContext,
    origin = actor.position
): boolean {
    return (
        actor !== target &&
        target.alive &&
        !target.tags.has('offline') &&
        !target.tags.has('state.retired') &&
        actor.locationId === target.locationId &&
        (context.targetId === undefined ||
            canObserveRoomCharacter(
                actor,
                target,
                context.navigation,
                context.now,
                origin
            )) &&
        (context.navigation?.hasLineOfSight(origin, target.position) ?? true)
    )
}
