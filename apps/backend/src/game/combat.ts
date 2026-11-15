import {
    type GameEventPayload,
    isItemBroken,
    ITEM_DEFINITIONS,
    type Vector2,
    type WorldCombatTarget,
} from '@my-game-ratata/contracts'

import { resolveCharacterDamage } from './abilityDamage'
import type { GameCharacter } from './character'
import type { PendingAttackHit } from './characterState'
import {
    applyAttackStun,
    dodgedAttack,
    resolveAttackDamage,
} from './combatDamage'
import { buildAttackZones, isInZones } from './combatGeometry'
import { attackMasteryReward } from './combatMastery'
import { canAttackCharacter } from './combatTargets'
import { recordRunicContact } from './constellations'
import { resolveGraveHit } from './graveCombat'
import type { GraveCombatContext } from './graveRules'
import { wearWeapon } from './itemDurability'
import { distance } from './math'
import type { NavigationService } from './navigation'
import {
    confirmCombatResourceSpend,
    confirmResourceSpend,
    recordUsefulResourceSpend,
} from './resourcePractice'
import { awardMasteries, captureMasteryFactors } from './skillProgression'
export { attemptAbilityAttack, attemptAttack } from './combatAttack'

export interface AttackContext {
    actor: GameCharacter
    target?: WorldCombatTarget | undefined
    graves?: GraveCombatContext | undefined
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
    if (attack === undefined || !availableToAttack(actor, now)) {
        return []
    }
    if (!validPendingWeapon(actor, attack)) {
        return []
    }
    const target =
        attack.target === undefined
            ? findHit(context, attack.targetId)
            : undefined
    const graveResult = resolveGraveHit(context, attack, target)
    if (graveResult !== undefined) {
        if (graveResult.hpDamage > 0) {
            attack.resourceSpends?.forEach(confirmResourceSpend)
        }
        return [
            ...graveResult.events,
            ...resolvedWeaponWear(actor, attack, graveResult.hpDamage),
        ]
    }
    return target === undefined
        ? [missedAttack(actor, attack)]
        : resolveCharacterHit(context, attack, target)
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
    }
}
function resolveCharacterHit(
    context: AttackContext,
    attack: PendingAttackHit,
    target: GameCharacter
): GameEventPayload[] {
    const { actor, now } = context
    const random = context.random ?? Math.random
    if (dodgedAttack(target, random)) {
        return [
            {
                kind: 'miss',
                hitQuality: 'miss',
                actorId: actor.id,
                targetId: target.id,
                text: 'Уклонение',
            },
        ]
    }
    const factors = captureMasteryFactors(actor)
    const roll = resolveAttackDamage(actor, attack, random)
    const result = resolveCharacterDamage({
        actor,
        target,
        now,
        amount: roll.amount,
        hitQuality: roll.hitQuality,
        damageKind: attack.abilityId === 'spark' ? 'arcane' : 'physical',
        respawnDelayMs: context.respawnDelayMsFor(target),
    })
    confirmCombatResourceSpend(
        actor,
        target,
        result,
        attack.resourceSpends ?? [],
        now
    )
    const events = result.events.map((event) =>
        event.kind === 'damage'
            ? {
                  ...event,
                  critical: roll.critical,
                  ...(attack.abilityId === undefined
                      ? {}
                      : { abilityId: attack.abilityId }),
              }
            : event
    )
    if (result.hpDamage > 0) {
        const drained = target.drainEnergy(attack.targetEnergyDrain)
        if (result.trainableDamage > 0) {
            recordUsefulResourceSpend(target, 'energy', drained)
        }
        events.push(...applyAttackStun(actor, target, attack, now, random))
    }
    if (result.trainableDamage > 0) {
        const reward = attackMasteryReward(actor, attack.abilityId)
        if (reward !== undefined) {
            if (attack.abilityId === 'spark' || attack.abilityId === 'shot') {
                events.push(
                    ...recordRunicContact(
                        actor,
                        target.id,
                        attack.abilityId === 'spark' ? 'spell' : 'shot',
                        now
                    )
                )
            }
            events.push(
                ...awardMasteries(actor, [reward], {
                    now,
                    random,
                    factors,
                    evidence: reward.evidence,
                })
            )
        }
    }
    events.push(...resolvedWeaponWear(actor, attack, result.impactDamage))
    return events
}

function usesWeapon(attack: PendingAttackHit): boolean {
    return (
        attack.abilityId === undefined || attack.abilityId === 'skeleton_strike'
    )
}

function validPendingWeapon(
    actor: GameCharacter,
    attack: PendingAttackHit
): boolean {
    if (!usesWeapon(attack)) {
        return true
    }
    const weapon = actor.equipment.weapon
    return (
        attack.weaponInstanceId === weapon?.instanceId &&
        (weapon === undefined || !isItemBroken(weapon))
    )
}

function resolvedWeaponWear(
    actor: GameCharacter,
    attack: PendingAttackHit,
    hpDamage: number
): GameEventPayload[] {
    const weapon = actor.equipment.weapon
    if (
        weapon === undefined ||
        !usesWeapon(attack) ||
        hpDamage <= 0 ||
        !wearWeapon(actor)
    ) {
        return []
    }
    return [
        {
            kind: 'notice',
            actorId: actor.id,
            text: `${ITEM_DEFINITIONS[weapon.itemId].name}: предмет сломан. Нужен ремонт у кузнеца.`,
        },
    ]
}
export function isTargetInAttackRange(
    actor: GameCharacter,
    target: { position: Vector2 },
    tileSize: number
): boolean {
    return isInZones(target, buildAttackZones(actor, tileSize))
}
/** A due hit still belongs to the combat tick; a later command must not replace it. */
export function availableToStartAttack(
    actor: GameCharacter,
    now: number
): boolean {
    return (
        availableToAttack(actor, now) &&
        !actor.isActionLocked(now) &&
        actor.pendingAttack === undefined
    )
}
export function availableToAttack(actor: GameCharacter, now: number): boolean {
    return (
        actor.alive &&
        actor.trainingTarget === undefined &&
        !actor.tags.has('offline') &&
        !actor.tags.has('state.retired') &&
        actor.stunUntil <= now
    )
}
export function isLegalAttackTarget(
    actor: GameCharacter,
    target: GameCharacter,
    context: AttackContext
): boolean {
    return (
        availableToAttackTarget(target) &&
        actor.locationId === target.locationId &&
        canAttackCharacter(actor, target, context.now) &&
        (context.navigation?.hasLineOfSight(actor.position, target.position) ??
            true)
    )
}
function availableToAttackTarget(target: GameCharacter): boolean {
    return (
        target.alive &&
        !target.tags.has('offline') &&
        !target.tags.has('state.retired')
    )
}
function findHit(
    context: AttackContext,
    targetId: string | undefined
): GameCharacter | undefined {
    const { actor } = context
    const candidates = context.targets.filter(
        (target) =>
            (targetId === undefined || target.id === targetId) &&
            isLegalAttackTarget(actor, target, context) &&
            isInZones(target, actor.attackZones)
    )
    candidates.sort(
        (a, b) =>
            distance(actor.position, a.position) -
            distance(actor.position, b.position)
    )
    return candidates[0]
}
