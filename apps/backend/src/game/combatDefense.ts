import {
    type AttackDelivery,
    type GameEventPayload,
    isArrowAbility,
    resolveBladeDefense,
    resolveCombatWeapon,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { PendingAttackHit } from './characterState'
import { resolveCharacterStats } from './characterStats'
import { leaveDefensiveStance } from './combatState'
import { constellationModifiers } from './constellationModifiers'
import { prayerAuraEffects, prayerCheckSample } from './prayerAuras'
import { boneStrikeGuardDrain, undeadPhysicalDefense } from './undeadCombat'

export interface ContactDefense {
    outcome: 'hit' | 'dodge' | 'parry'
    multiplier: number
    /** A paid guard contact replaces the usual post-damage energy loss. */
    paidGuard: boolean
    events: GameEventPayload[]
}
export function attackDelivery(attack: PendingAttackHit): AttackDelivery {
    return (
        attack.delivery ??
        (attack.abilityId === 'spark' ||
        attack.abilityId === 'fireball' ||
        attack.abilityId === 'greater_fireball'
            ? 'magic'
            : isArrowAbility(attack.abilityId)
              ? 'ranged_physical'
              : 'melee_physical')
    )
}

/** One disjoint defense roll; none of its outcomes can pay twice. */
export function defendContact(
    attacker: GameCharacter,
    target: GameCharacter,
    attack: PendingAttackHit,
    now: number,
    random: () => number
): ContactDefense {
    if (target.trainingTarget !== undefined) {
        return unguardedHit()
    }
    const state = prepareDefense(target, attack, now)
    const dodge = dodgeChance(target, state)
    const parry = parryChance(state)
    const sample = prayerCheckSample(random, state.effects.advantage)
    const outcome =
        sample < Math.min(0.95, dodge)
            ? 'dodge'
            : sample < Math.min(0.95, dodge + parry)
              ? 'parry'
              : 'hit'
    if (outcome !== 'hit') {
        return paidAvoidance(attacker, target, attack, state.delivery, outcome)
    }
    const hit =
        state.guarding && state.physical
            ? paidGuardHit(
                  target,
                  attack,
                  state,
                  boneStrikeGuardDrain(attacker, target, attack, now)
              )
            : unguardedHit()
    if (state.delivery === 'ranged_physical') {
        hit.multiplier *= state.modifiers.rangedPhysicalDamageMultiplier
    }
    hit.multiplier *= undeadPhysicalDefense(
        attacker,
        target,
        state.delivery,
        now
    )
    return hit
}

function unguardedHit(): ContactDefense {
    return { outcome: 'hit', multiplier: 1, paidGuard: false, events: [] }
}

function prepareDefense(
    target: GameCharacter,
    attack: PendingAttackHit,
    now: number
) {
    const delivery = attackDelivery(attack)
    const physical = delivery !== 'magic'
    const weapon = resolveCombatWeapon(
        target.archetype,
        target.equipment.weapon
    )
    const blade = weapon.bladeCompatible && !weapon.broken
    const modifiers = constellationModifiers(target)
    const guard = resolveBladeDefense(modifiers)
    if (
        target.combat.defensiveStance &&
        (!blade || (physical && target.energy < guard.hitEnergy))
    ) {
        leaveDefensiveStance(target, now)
    }
    return {
        delivery,
        physical,
        blade,
        modifiers,
        guard,
        guarding: target.combat.defensiveStance,
        effects: prayerAuraEffects(target, now),
        canDefend: target.energy >= 5 && target.stunUntil <= now,
    }
}
type DefenseState = ReturnType<typeof prepareDefense>

function dodgeChance(target: GameCharacter, state: DefenseState): number {
    if (!state.canDefend || state.guarding) {
        return 0
    }
    const bladeBonus =
        state.blade && state.delivery === 'melee_physical'
            ? state.modifiers.swordDodgeBonus
            : 0
    return (
        resolveCharacterStats(target.config, target.equipment).dodgeChance +
        state.effects.dodgeBonus +
        bladeBonus
    )
}
function parryChance(state: DefenseState): number {
    if (!state.canDefend || !state.blade) {
        return 0
    }
    if (state.guarding) {
        return state.delivery === 'melee_physical'
            ? state.guard.meleeParryChance
            : state.delivery === 'ranged_physical'
              ? state.guard.rangedParryChance
              : 0
    }
    return state.delivery === 'melee_physical'
        ? state.modifiers.bladeParryChance
        : 0
}
function paidAvoidance(
    attacker: GameCharacter,
    target: GameCharacter,
    attack: PendingAttackHit,
    delivery: AttackDelivery,
    outcome: 'dodge' | 'parry'
): ContactDefense {
    target.drainEnergy(5)
    return {
        outcome,
        multiplier: 0,
        paidGuard: false,
        events: [
            {
                kind: outcome === 'parry' ? 'parry' : 'miss',
                actorId: attacker.id,
                targetId: target.id,
                hitQuality: 'miss',
                text: outcome === 'parry' ? 'Парирование' : 'Уклонение',
                ...(attack.actionId === undefined
                    ? {}
                    : { actionId: attack.actionId }),
                attackOrigin: attack.origin ?? 'basic',
                delivery,
            },
        ],
    }
}
function paidGuardHit(
    target: GameCharacter,
    attack: PendingAttackHit,
    state: DefenseState,
    extraEnergy: number
): ContactDefense {
    target.drainEnergy(
        (attack.targetEnergyDrain === 20 ? 20 : state.guard.hitEnergy) +
            extraEnergy
    )
    return {
        ...unguardedHit(),
        paidGuard: true,
        multiplier:
            1 -
            (state.delivery === 'melee_physical'
                ? state.guard.meleeReduction
                : state.guard.rangedReduction),
    }
}
