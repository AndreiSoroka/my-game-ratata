import {
    ABILITY_DEFINITIONS,
    type CombatHitQuality,
    type GameEventPayload,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { PendingAttackHit } from './characterState'
import { resolveCharacterStats } from './characterStats'
import { combatHitQuality } from './combatHitQuality'
import { constellationModifiers } from './constellationModifiers'
import { effectiveCharacterStats } from './effectiveParameters'
import {
    type PrayerAuraEffects,
    prayerAuraEffects,
    prayerStunImmune,
    rollCharacterCheck,
} from './prayerAuras'
import { hasEquippedSword } from './skillProgression'
export function dodgedAttack(
    target: GameCharacter,
    random: () => number,
    now = Date.now(),
    effects: PrayerAuraEffects = prayerAuraEffects(target, now)
): boolean {
    return rollCharacterCheck(
        target,
        Math.min(
            0.95,
            effectiveCharacterStats(target).dodgeChance + effects.dodgeBonus
        ),
        random,
        now,
        effects.advantage
    )
}
export function resolveAttackDamage(
    actor: GameCharacter,
    attack: PendingAttackHit,
    random: () => number,
    now = Date.now(),
    effects: PrayerAuraEffects = prayerAuraEffects(actor, now)
): { amount: number; critical: boolean; hitQuality: CombatHitQuality } {
    const stats = resolveCharacterStats(actor.config, actor.equipment)
    const definition =
        attack.abilityId === undefined
            ? undefined
            : ABILITY_DEFINITIONS[attack.abilityId]
    const low = definition?.damage ?? stats.minDamage
    const high = definition?.maxDamage ?? stats.maxDamage
    const roll = effects.minimumDamage
        ? low
        : Math.floor(low + random() * (high - low + 1))
    let amount = roll
    const critical = attackCritical(
        actor,
        attack,
        stats.critChance,
        random,
        now,
        effects
    )
    if (critical) {
        amount *= actor.config.combat.critMultiplier
    }
    return {
        amount: Math.max(
            1,
            Math.round(
                amount * attack.damageMultiplier * attackBonus(actor, attack)
            )
        ),
        critical,
        hitQuality: combatHitQuality(
            roll,
            low,
            high,
            critical,
            attack.underpowered === true
        ),
    }
}
function attackCritical(
    actor: GameCharacter,
    attack: PendingAttackHit,
    chance: number,
    random: () => number,
    now: number,
    effects: PrayerAuraEffects
): boolean {
    const modifiers = constellationModifiers(actor)
    const sword = attack.abilityId === undefined && hasEquippedSword(actor)
    const bonus =
        attack.abilityId === 'shot'
            ? modifiers.shotCritBonus
            : sword
              ? modifiers.swordCritBonus
              : 0
    return (
        !effects.minimumDamage &&
        rollCharacterCheck(
            actor,
            Math.min(0.95, chance + bonus),
            random,
            now,
            effects.advantage
        )
    )
}
function attackBonus(actor: GameCharacter, attack: PendingAttackHit): number {
    const modifiers = constellationModifiers(actor)
    if (attack.abilityId === 'shot') {
        return modifiers.shotDamageMultiplier
    }
    if (attack.abilityId === 'spark') {
        return modifiers.sparkDamageMultiplier
    }
    return attack.abilityId === undefined && hasEquippedSword(actor)
        ? modifiers.swordDamageMultiplier
        : 1
}
export function applyAttackStun(
    actor: GameCharacter,
    target: GameCharacter,
    attack: PendingAttackHit,
    now: number,
    random: () => number,
    advantage = prayerAuraEffects(actor, now).advantage,
    stunImmune = prayerStunImmune(target, now)
): GameEventPayload[] {
    if (!attack.canStun || !target.alive || stunImmune) {
        return []
    }
    const combat = actor.config.combat
    const heavy = attack.abilityId === 'skeleton_strike'
    if (
        !heavy &&
        !rollCharacterCheck(actor, combat.stunChance, random, now, advantage)
    ) {
        return []
    }
    const baseDuration = heavy
        ? 800
        : Math.floor(
              combat.stunMinDurationMs +
                  random() *
                      (combat.stunMaxDurationMs - combat.stunMinDurationMs + 1)
          )
    const duration = Math.round(
        baseDuration * constellationModifiers(target).stunDurationMultiplier
    )
    target.stunUntil = Math.max(target.stunUntil, now + duration)
    target.clearPath()
    target.setMoveInput({ x: 0, y: 0 })
    target.clearPendingAttackHit()
    return [
        {
            kind: 'status',
            actorId: actor.id,
            targetId: target.id,
            statusId: 'stun',
            expiresAt: target.stunUntil,
        },
    ]
}
