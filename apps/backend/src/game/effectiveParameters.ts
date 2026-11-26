import {
    ABILITY_DEFINITIONS,
    type AbilityDefinition,
    type AbilityId,
    ASH_RULES,
    type BladeTechniqueParameters,
    CITY_PORTAL_MANA_FRACTION,
    isArcaneAbility,
    isArrowAbility,
    isBladeAbility,
    isFireSpell,
    MAGIC_ABILITY_RULES,
    MOVEMENT_RULES,
    resolveBladeTechnique,
    ROAD_PRAYER_RULES,
    THEFT_RULES,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { resolveCharacterStats } from './characterStats'
import { ashParameters, constellationModifiers } from './constellationModifiers'
import { resolveArrowParameters } from './effectiveArrowParameters'
import { effectiveMaxMana } from './effectiveResources'
import {
    effectiveOrdinaryAttackZones,
    fatZombieBonuses,
} from './fatZombieModifiers'
import { hasEquippedSword } from './skillProgression'
import { boneStrikePower, boneStrikeWindupBonus } from './undeadCombat'

/** Supply authored tile width whenever consuming range, rather than assuming world units. */
export function effectiveAbility(
    actor: GameCharacter,
    id: AbilityId,
    cellSize = 0
): AbilityDefinition &
    Partial<BladeTechniqueParameters> & {
        cycleMs: number
        movementMs: number
    } {
    const definition = { ...ABILITY_DEFINITIONS[id] }
    if (id === 'ash_raise') {
        definition.windupMs = ashParameters(actor).raiseWindupMs
    }
    if (id === 'ash_exhaustion' && cellSize > 0) {
        definition.range = ASH_RULES.exhaustion.rangeCells * cellSize
    }
    if (isBladeAbility(id)) {
        return {
            ...definition,
            ...resolveBladeTechnique(
                id,
                constellationModifiers(actor),
                effectiveAttackEnergyCost(actor),
                ordinaryAttackRadius(actor, cellSize)
            ),
        }
    }
    const modifiers = constellationModifiers(actor)
    if (isArrowAbility(id)) {
        return resolveArrowParameters(
            id,
            modifiers,
            cellSize > 0 ? cellSize : MOVEMENT_RULES.stepDistance,
            actor.movement.mode === 'walking'
        )
    }
    if (id === 'skeleton_strike') {
        const windupMs = definition.windupMs + boneStrikeWindupBonus(actor)
        return {
            ...definition,
            windupMs,
            cycleMs: windupMs,
            movementMs: windupMs,
            damageMultiplier: boneStrikePower(actor),
        }
    }
    if (id === 'spark') {
        definition.range += modifiers.sparkRangeCells * cellSize
        definition.mana -= modifiers.sparkManaDiscount
        scaleDamage(definition, modifiers.sparkDamageMultiplier)
    }
    if (isArcaneAbility(id)) {
        applySpellParameters(actor, id, definition, cellSize)
    }
    return {
        ...definition,
        cycleMs: Math.max(definition.windupMs, 200),
        movementMs: Math.max(definition.windupMs, 200),
    }
}

function applySpellParameters(
    actor: GameCharacter,
    id: AbilityId,
    definition: AbilityDefinition,
    cellSize: number
): void {
    const base =
        id === 'city_portal'
            ? effectiveMaxMana(actor) * CITY_PORTAL_MANA_FRACTION
            : definition.mana
    definition.mana = effectiveSpellMana(actor, base)
    if (isFireSpell(id)) {
        scaleDamage(
            definition,
            constellationModifiers(actor).fireDamageMultiplier
        )
    }
    if (cellSize <= 0) {
        return
    }
    if (isFireSpell(id) || id === 'blink') {
        definition.range = MAGIC_ABILITY_RULES[id].rangeTiles * cellSize
    }
    if (id === 'chains' || id === 'dispel_magic') {
        definition.range = MAGIC_ABILITY_RULES[id].radiusTiles * cellSize
    }
}

export function effectiveSpellMana(actor: GameCharacter, base: number): number {
    const { spellManaMultiplier } = constellationModifiers(actor)
    return Math.ceil(Math.max(0, base * spellManaMultiplier) - 1e-10)
}

function scaleDamage(
    definition: { damage?: number; maxDamage?: number },
    multiplier: number
): void {
    if (definition.damage !== undefined) {
        definition.damage *= multiplier
    }
    if (definition.maxDamage !== undefined) {
        definition.maxDamage *= multiplier
    }
}

export function effectiveCharacterStats(actor: GameCharacter) {
    const stats = resolveCharacterStats(actor.config, actor.equipment)
    const modifiers = constellationModifiers(actor)
    if (hasEquippedSword(actor)) {
        stats.minDamage = Math.round(
            stats.minDamage * modifiers.swordDamageMultiplier
        )
        stats.maxDamage = Math.round(
            stats.maxDamage * modifiers.swordDamageMultiplier
        )
        stats.critChance = Math.min(
            0.95,
            stats.critChance + modifiers.swordCritBonus
        )
        stats.dodgeChance = Math.min(
            0.95,
            stats.dodgeChance + modifiers.swordDodgeBonus
        )
    }
    stats.attackCooldownMs = effectiveAttackCooldown(actor)
    stats.moveSpeed = effectiveMoveSpeed(actor)
    return stats
}

export function effectiveAttackCooldown(actor: GameCharacter): number {
    return (
        (actor.config.combat.attackCooldownMs -
            fatZombieBonuses(actor).cycleReductionMs) *
        (hasEquippedSword(actor)
            ? constellationModifiers(actor).swordTempoMultiplier
            : 1)
    )
}

export function effectiveAttackEnergyCost(actor: GameCharacter): number {
    return Math.ceil(
        (actor.config.resources.attackEnergyCost -
            fatZombieBonuses(actor).energyDiscount) *
            (hasEquippedSword(actor)
                ? constellationModifiers(actor).swordEnergyMultiplier
                : 1) -
            1e-10
    )
}

export function effectiveMoveSpeed(actor: GameCharacter): number {
    const modifiers = constellationModifiers(actor)
    return (
        (actor.config.moveSpeed + fatZombieBonuses(actor).moveSpeed) *
        modifiers.moveSpeedMultiplier
    )
}

export function roadPrayerDashRemainingMs(
    actor: GameCharacter,
    now: number
): number {
    return Math.max(0, (actor.movement.roadPrayerDashUntil ?? now) - now)
}

export function effectiveDashCost(
    actor: GameCharacter,
    now = Date.now()
): number {
    const discount =
        roadPrayerDashRemainingMs(actor, now) > 0
            ? ROAD_PRAYER_RULES.dashDiscount
            : (actor.movement.ashPrayerDashUntil ?? now) > now
              ? ASH_RULES.dashDiscount
              : 0
    return Math.max(
        0,
        MOVEMENT_RULES.dashEnergy *
            constellationModifiers(actor).dashEnergyMultiplier -
            discount
    )
}

export function effectiveDashDuration(actor: GameCharacter): number {
    return (
        MOVEMENT_RULES.dashDurationMs +
        constellationModifiers(actor).dashDurationBonus
    )
}

export function effectiveWorkEnergy(
    actor: GameCharacter,
    base: number
): number {
    return base * constellationModifiers(actor).workEnergyMultiplier
}

export function effectiveTheftCost(actor: GameCharacter): number {
    return (
        THEFT_RULES.energyCost -
        constellationModifiers(actor).theftEnergyDiscount
    )
}

export function ordinaryAttackRadius(
    actor: GameCharacter,
    tileSize: number
): number {
    return Math.max(
        0,
        ...effectiveOrdinaryAttackZones(actor).map(
            (zone) =>
                Math.hypot(
                    Math.max(Math.abs(zone.minX), Math.abs(zone.maxX)),
                    Math.max(Math.abs(zone.minY), Math.abs(zone.maxY))
                ) * tileSize
        )
    )
}

export function effectiveAttackPhases(
    actor: GameCharacter,
    underpowered = false
) {
    const tempo = hasEquippedSword(actor)
        ? constellationModifiers(actor).swordTempoMultiplier
        : 1
    const scale = underpowered ? 2 : 1
    const bonuses = fatZombieBonuses(actor)
    const windupMs = Math.round(
        (actor.config.combat.attackWindupMs - bonuses.windupReductionMs) *
            tempo *
            scale
    )
    return {
        cycleMs: Math.round(effectiveAttackCooldown(actor) * scale),
        windupMs,
        movementMs:
            hasEquippedSword(actor) &&
            constellationModifiers(actor).bladeFluidStance
                ? windupMs
                : Math.round(
                      (actor.config.combat.attackLockMs -
                          bonuses.movementLockReductionMs) *
                          tempo *
                          scale
                  ),
    }
}
