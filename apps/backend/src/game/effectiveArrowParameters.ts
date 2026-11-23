import {
    ABILITY_DEFINITIONS,
    type ArrowAbilityId,
    MOVEMENT_RULES,
} from '@my-game-ratata/contracts'

import type { constellationModifiers } from './constellationModifiers'

type ArrowModifiers = Pick<
    ReturnType<typeof constellationModifiers>,
    | 'shotDamageMultiplier'
    | 'shotEnergyDiscount'
    | 'shotRangeCells'
    | 'shotTempoMultiplier'
    | 'shotWhileMoving'
    | 'sniperCooldownReductionMs'
    | 'sniperEnergyDiscount'
    | 'sniperRangeCells'
    | 'sniperWindupReductionMs'
>

export function resolveArrowParameters(
    id: ArrowAbilityId,
    modifiers: ArrowModifiers,
    tileWidth: number = MOVEMENT_RULES.stepDistance,
    walking = true
) {
    const definition = ABILITY_DEFINITIONS[id]
    if (id === 'sniper_shot') {
        const windupMs = definition.windupMs - modifiers.sniperWindupReductionMs
        const cooldownMs =
            definition.cooldownMs - modifiers.sniperCooldownReductionMs
        return {
            ...definition,
            windupMs,
            cooldownMs,
            cycleMs: cooldownMs,
            movementMs: windupMs,
            range: (10 + modifiers.sniperRangeCells) * tileWidth,
            energy: definition.energy - modifiers.sniperEnergyDiscount,
        }
    }
    const multiplier = modifiers.shotDamageMultiplier
    return {
        ...definition,
        cycleMs: 200,
        movementMs:
            modifiers.shotWhileMoving && walking ? 0 : definition.windupMs,
        range: (4 + modifiers.shotRangeCells) * tileWidth,
        energy: definition.energy - modifiers.shotEnergyDiscount,
        cooldownMs: Math.round(
            definition.cooldownMs * modifiers.shotTempoMultiplier
        ),
        damage: (definition.damage ?? 0) * multiplier,
        maxDamage: (definition.maxDamage ?? 0) * multiplier,
    }
}
