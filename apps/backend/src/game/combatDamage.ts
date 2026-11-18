import {
    ABILITY_DEFINITIONS,
    type CombatHitQuality,
    type GameEventPayload,
    HUMAN_MELEE_RULES,
    isBladeAttackAbility,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { PendingAttackHit } from './characterState'
import { resolveCharacterStats } from './characterStats'
import { combatHitQuality } from './combatHitQuality'
import { clearCombatTransient } from './combatState'
import { constellationModifiers } from './constellationModifiers'
import {
    type PrayerAuraEffects,
    prayerAuraEffects,
    prayerStunImmune,
    rollCharacterCheck,
} from './prayerAuras'
import { hasEquippedSword } from './skillProgression'
export function resolveRawAttackDamage(
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
            0,
            amount *
                (attack.damageMultiplier * attackBonus(actor, attack) +
                    (attack.comboBonus ?? 0))
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
/** Compatibility/read-only roll; contact resolution rounds once after target mitigation. */
export function resolveAttackDamage(
    actor: GameCharacter,
    attack: PendingAttackHit,
    random: () => number,
    now = Date.now(),
    effects: PrayerAuraEffects = prayerAuraEffects(actor, now)
) {
    const result = resolveRawAttackDamage(actor, attack, random, now, effects)
    return { ...result, amount: Math.max(1, Math.round(result.amount)) }
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
    const sword =
        (attack.abilityId === undefined ||
            isBladeAttackAbility(attack.abilityId)) &&
        hasEquippedSword(actor)
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
    return (attack.abilityId === undefined ||
        isBladeAttackAbility(attack.abilityId)) &&
        hasEquippedSword(actor)
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
    if (stunUnavailable(target, attack, now, stunImmune)) {
        return []
    }
    const heavy = attack.abilityId === 'skeleton_strike'
    const pommel = attack.abilityId === 'pommel_strike'
    const chance = hasEquippedSword(actor)
        ? constellationModifiers(actor).bladeStunChance
        : actor.config.combat.stunChance
    if (
        !heavy &&
        !pommel &&
        !rollCharacterCheck(actor, chance, random, now, advantage)
    ) {
        return []
    }
    const baseDuration = attackStunDuration(actor, attack, random)
    const duration = Math.round(
        baseDuration * constellationModifiers(target).stunDurationMultiplier
    )
    target.stunUntil = now + duration
    target.combat.stunImmuneUntil =
        target.stunUntil + HUMAN_MELEE_RULES.stunImmunityMs
    clearCombatTransient(target, now)
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

function stunUnavailable(
    target: GameCharacter,
    attack: PendingAttackHit,
    now: number,
    immune: boolean
): boolean {
    return (
        !attack.canStun ||
        !target.alive ||
        target.trainingTarget !== undefined ||
        immune ||
        target.stunUntil > now ||
        target.combat.stunImmuneUntil > now
    )
}
function attackStunDuration(
    actor: GameCharacter,
    attack: PendingAttackHit,
    random: () => number
): number {
    if (attack.abilityId === 'pommel_strike') {
        return attack.stunDurationMs ?? 400
    }
    if (attack.abilityId === 'skeleton_strike') {
        return 800
    }
    if (actor.archetype === 'human') {
        return HUMAN_MELEE_RULES.stunMs
    }
    return Math.floor(
        actor.config.combat.stunMinDurationMs +
            random() *
                (actor.config.combat.stunMaxDurationMs -
                    actor.config.combat.stunMinDurationMs +
                    1)
    )
}
