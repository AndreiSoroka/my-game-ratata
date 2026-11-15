import {
    ABILITY_DEFINITIONS,
    type AbilityId,
    MOVEMENT_RULES,
    THEFT_RULES,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { resolveCharacterStats } from './characterStats'
import { constellationModifiers } from './constellationModifiers'
import { hasEquippedSword } from './skillProgression'

/** Supply authored tile width whenever consuming range, rather than assuming world units. */
export function effectiveAbility(
    actor: GameCharacter,
    id: AbilityId,
    cellSize = 0
) {
    const definition = { ...ABILITY_DEFINITIONS[id] }
    const modifiers = constellationModifiers(actor)
    if (id === 'shot') {
        definition.range += modifiers.shotRangeCells * cellSize
        definition.energy -= modifiers.shotEnergyDiscount
        definition.cooldownMs *= modifiers.shotTempoMultiplier
        scaleDamage(definition, modifiers.shotDamageMultiplier)
    }
    if (id === 'spark') {
        definition.range += modifiers.sparkRangeCells * cellSize
        definition.mana -= modifiers.sparkManaDiscount
        scaleDamage(definition, modifiers.sparkDamageMultiplier)
    }
    if (id === 'fireball' || id === 'greater_fireball') {
        definition.damage =
            (definition.damage ?? 0) +
            (actor.progression.skills[id].level - 1) *
                (id === 'fireball' ? 2 : 3)
        scaleDamage(definition, modifiers.fireDamageMultiplier)
    }
    return definition
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
    const stats = resolveCharacterStats(
        actor.config,
        actor.equipment,
        actor.progression.skills.swordsmanship.level
    )
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
        actor.config.combat.attackCooldownMs *
        (hasEquippedSword(actor)
            ? constellationModifiers(actor).swordTempoMultiplier
            : 1)
    )
}

export function effectiveAttackEnergyCost(actor: GameCharacter): number {
    return (
        actor.config.resources.attackEnergyCost *
        (hasEquippedSword(actor)
            ? constellationModifiers(actor).swordEnergyMultiplier
            : 1)
    )
}

export function effectiveMoveSpeed(actor: GameCharacter): number {
    const modifiers = constellationModifiers(actor)
    return actor.config.moveSpeed * modifiers.moveSpeedMultiplier
}

export function effectiveDashCost(actor: GameCharacter): number {
    return (
        MOVEMENT_RULES.dashEnergy *
        constellationModifiers(actor).dashEnergyMultiplier
    )
}

export function effectiveTheftCost(actor: GameCharacter): number {
    return (
        THEFT_RULES.energyCost -
        constellationModifiers(actor).theftEnergyDiscount
    )
}
