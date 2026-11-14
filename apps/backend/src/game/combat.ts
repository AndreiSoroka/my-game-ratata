import {
    type AttackAbilityId,
    type GameEventPayload,
    isItemBroken,
    ITEM_DEFINITIONS,
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
import { canTargetByFaction } from './factions'
import { wearWeapon } from './itemDurability'
import { distance } from './math'
import type { NavigationService } from './navigation'
import { hasEquippedSword, trainSkill } from './skillProgression'
export { attemptAbilityAttack, attemptAttack } from './combatAttack'

export interface AttackContext {
    actor: GameCharacter
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
    const target = findHit(context, attack.targetId)
    if (target === undefined) {
        return []
    }
    const random = context.random ?? Math.random
    if (dodgedAttack(target, random)) {
        return [
            {
                kind: 'miss',
                actorId: actor.id,
                targetId: target.id,
                text: 'Уклонение',
            },
        ]
    }
    const roll = resolveAttackDamage(actor, attack, random)
    const result = resolveCharacterDamage({
        actor,
        target,
        now,
        amount: roll.amount,
        damageKind: attack.abilityId === 'spark' ? 'arcane' : 'physical',
        respawnDelayMs: context.respawnDelayMsFor(target),
    })
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
        target.drainEnergy(attack.targetEnergyDrain)
        events.push(...applyAttackStun(actor, target, attack, now, random))
    }
    if (result.trainableDamage > 0) {
        events.push(...practiceAttack(actor, attack.abilityId))
    }
    events.push(...resolvedWeaponWear(actor, attack, result.hpDamage))
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
    target: GameCharacter,
    tileSize: number
): boolean {
    return isInZones(target, buildAttackZones(actor, tileSize))
}
export function availableToAttack(actor: GameCharacter, now: number): boolean {
    return (
        actor.alive &&
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
        canTargetByFaction(actor, target, context.now) &&
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
function practiceAttack(
    actor: GameCharacter,
    abilityId: AttackAbilityId | undefined
): GameEventPayload[] {
    if (abilityId === 'spark') {
        return trainSkill(actor, 'arcana')
    }
    return (abilityId === undefined || abilityId === 'skeleton_strike') &&
        hasEquippedSword(actor)
        ? trainSkill(actor, 'swordsmanship')
        : []
}
