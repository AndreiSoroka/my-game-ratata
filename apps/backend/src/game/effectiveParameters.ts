import {
    ABILITY_DEFINITIONS,
    type AbilityDefinition,
    type AbilityId,
    type BladeTechniqueParameters,
    isBladeAbility,
    MOVEMENT_RULES,
    resolveBladeTechnique,
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
): AbilityDefinition &
    Partial<BladeTechniqueParameters> & {
        cycleMs: number
        movementMs: number
    } {
    const definition = { ...ABILITY_DEFINITIONS[id] }
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
        scaleDamage(definition, modifiers.fireDamageMultiplier)
    }
    return {
        ...definition,
        cycleMs: Math.max(definition.windupMs, 200),
        movementMs: Math.max(definition.windupMs, 200),
    }
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
        actor.config.combat.attackCooldownMs *
        (hasEquippedSword(actor)
            ? constellationModifiers(actor).swordTempoMultiplier
            : 1)
    )
}

export function effectiveAttackEnergyCost(actor: GameCharacter): number {
    return Math.ceil(
        actor.config.resources.attackEnergyCost *
            (hasEquippedSword(actor)
                ? constellationModifiers(actor).swordEnergyMultiplier
                : 1) -
            1e-10
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

export function ordinaryAttackRadius(
    actor: GameCharacter,
    tileSize: number
): number {
    return Math.max(
        0,
        ...actor.config.attackZones.map(
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
    const windupMs = Math.round(
        actor.config.combat.attackWindupMs * tempo * scale
    )
    return {
        cycleMs: Math.round(effectiveAttackCooldown(actor) * scale),
        windupMs,
        movementMs:
            hasEquippedSword(actor) &&
            constellationModifiers(actor).bladeFluidStance
                ? windupMs
                : Math.round(actor.config.combat.attackLockMs * tempo * scale),
    }
}
