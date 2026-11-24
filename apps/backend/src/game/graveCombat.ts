import {
    type CombatHitQuality,
    type GameEventPayload,
    graveBounds,
    ITEM_DEFINITIONS,
    materialDamage,
    type MaterialImpact,
    resolveCombatWeapon,
    type Vector2,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { PendingAttackHit } from './characterState'
import type { AttackContext } from './combat'
import { resolveAttackDamage } from './combatDamage'
import { isInZones } from './combatGeometry'
import type { GraveCombatContext, GraveCombatTarget } from './graveRules'
import { distance } from './math'
import type { NavigationService } from './navigation'
import { withWorldSound } from './worldSound'

export function legalGraveTarget(
    actor: GameCharacter,
    grave: GraveCombatTarget | undefined,
    navigation: NavigationService | undefined,
    origin: Vector2 = actor.position
): grave is GraveCombatTarget {
    return (
        grave?.phase === 'active' &&
        grave.hp > 0 &&
        grave.locationId === actor.locationId &&
        (navigation?.hasLineOfSight(origin, grave.position) ?? true)
    )
}

/** Explicit world targets stay pinned; untargeted attacks resolve only one nearest hit. */
export function findGraveHit(
    context: AttackContext,
    attack: PendingAttackHit
): GraveCombatTarget | undefined {
    if (context.graves === undefined || attack.targetId !== undefined) {
        return undefined
    }
    const candidates =
        attack.target === undefined
            ? context.graves.list(context.actor.locationId)
            : [context.graves.get(attack.target.id)]
    const origin = attack.sparkPath?.origin ?? context.actor.position
    return candidates
        .filter(
            (grave): grave is GraveCombatTarget =>
                legalGraveTarget(
                    context.actor,
                    grave,
                    context.navigation,
                    origin
                ) &&
                isInZones(grave, context.actor.attackZones) &&
                (attack.maxRange === undefined ||
                    distance(origin, grave.position) <= attack.maxRange)
        )
        .sort(
            (a, b) =>
                distance(origin, a.position) - distance(origin, b.position)
        )[0]
}

export function damageGrave(
    actor: GameCharacter,
    grave: GraveCombatTarget,
    attack: PendingAttackHit,
    amount: number,
    critical: boolean,
    now: number,
    graves: GraveCombatContext,
    hitQuality: CombatHitQuality = critical ? 'critical' : 'normal'
): { events: GameEventPayload[]; hpDamage: number } {
    const impact = graveImpact(actor, attack)
    const result = graves.damage(
        grave.id,
        materialDamage(grave.material, impact, amount),
        now
    )
    if (!result.accepted || result.hpDamage <= 0) {
        return { events: [], hpDamage: 0 }
    }
    const target = { kind: 'grave' as const, id: grave.id }
    const events: GameEventPayload[] = [
        withWorldSound(
            {
                kind: 'world_damage',
                actorId: actor.id,
                target,
                amount: result.hpDamage,
                critical,
                hitQuality,
                damageKind: impact === 'arcane' ? 'arcane' : 'physical',
                ...(attack.abilityId === undefined
                    ? {}
                    : { abilityId: attack.abilityId }),
            },
            'hit',
            grave.locationId,
            grave.position,
            { sourceBounds: graveBounds(grave.position) }
        ),
    ]
    if (result.ruined) {
        events.push({ kind: 'grave_ruined', actorId: actor.id, target })
    }
    return { events, hpDamage: result.hpDamage }
}
function graveImpact(
    actor: GameCharacter,
    attack: PendingAttackHit
): MaterialImpact {
    if (attack.abilityId === 'shot') {
        return 'projectile'
    }
    if (
        attack.abilityId === 'spark' ||
        attack.abilityId === 'fireball' ||
        attack.abilityId === 'greater_fireball'
    ) {
        return 'arcane'
    }
    const item = actor.equipment.weapon
    if (item === undefined) {
        return resolveCombatWeapon(actor.archetype).kind === 'knife'
            ? 'weapon'
            : 'unarmed'
    }
    return ITEM_DEFINITIONS[item.itemId].gathering?.stone === undefined
        ? 'weapon'
        : 'stone_tool'
}

export function resolveGraveHit(
    context: AttackContext,
    attack: PendingAttackHit,
    target: GameCharacter | undefined
): { events: GameEventPayload[]; hpDamage: number } | undefined {
    const grave = findGraveHit(context, attack)
    if (
        grave === undefined ||
        context.graves === undefined ||
        (target !== undefined &&
            distance(context.actor.position, grave.position) >=
                distance(context.actor.position, target.position))
    ) {
        return undefined
    }
    const roll =
        attack.rawDamage === undefined
            ? resolveAttackDamage(
                  context.actor,
                  attack,
                  context.random ?? Math.random,
                  context.now
              )
            : {
                  amount: attack.rawDamage,
                  critical: false,
                  hitQuality: 'normal' as const,
              }
    return damageGrave(
        context.actor,
        grave,
        attack,
        roll.amount,
        roll.critical,
        context.now,
        context.graves,
        roll.hitQuality
    )
}
