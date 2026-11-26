import { ARTISAN_LUMBER_RULES, ARTISAN_STARS } from '@my-game-ratata/contracts'

import { ashExhaustionCapacity } from './ashExhaustion'
import type { GameCharacter } from './character'
import { bladeHealthMultiplier } from './constellationBladeBonuses'
import { ENDURANCE_ENERGY_PERCENT } from './constellationBonuses'
import { activeConstellationStars, hasStar } from './constellations'
import { undeadEnergyBonus, undeadHealthBonus } from './constellationUndead'
import { fatZombieBonuses } from './fatZombieModifiers'
import { undeadImprintBonus } from './undeadSurvivalState'

/** Base configuration stays intact; the identity's learned trait determines its current capacity. */
export function effectiveMaxHp(actor: GameCharacter): number {
    const opened = activeConstellationStars(actor)
    const multiplier =
        bladeHealthMultiplier(opened) - (opened.has('prayer.martyr') ? 0.3 : 0)
    const base = actor.baseMaxHp + undeadHealthBonus(opened)
    const capacity = base + undeadImprintBonus(actor, 'hp', opened)
    const normal = Math.floor(capacity * multiplier + 1e-10)
    return Math.max(
        1,
        Math.floor(normal * ashExhaustionCapacity(actor) + 1e-10)
    )
}

export function effectiveMaxMana(actor: GameCharacter): number {
    const base = actor.config.resources.maxMana
    const capacity = hasStar(actor, 'prayer.martyr') ? base * 0.85 : base
    return capacity * ashExhaustionCapacity(actor)
}

export function effectiveMaxEnergy(actor: GameCharacter): number {
    const opened = activeConstellationStars(actor)
    const base =
        actor.config.resources.maxEnergy +
        undeadEnergyBonus(opened) +
        fatZombieBonuses(actor).energyCapacity
    const capacity = base + undeadImprintBonus(actor, 'energy', opened)
    const normal = opened.has('life.endurance')
        ? (capacity * ENDURANCE_ENERGY_PERCENT) / 100
        : capacity
    const artisanBonus = opened.has(ARTISAN_STARS.endurance)
        ? ARTISAN_LUMBER_RULES.energyBonus
        : 0
    return (normal + artisanBonus) * ashExhaustionCapacity(actor)
}
