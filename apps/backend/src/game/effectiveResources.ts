import type { GameCharacter } from './character'
import { bladeHealthMultiplier } from './constellationBladeBonuses'
import { ENDURANCE_ENERGY_PERCENT } from './constellationBonuses'
import { undeadEnergyBonus, undeadHealthBonus } from './constellationUndead'

/** Base configuration stays intact; the identity's learned trait determines its current capacity. */
export function effectiveMaxHp(actor: GameCharacter): number {
    const opened = actor.progression.constellations.opened
    const multiplier =
        bladeHealthMultiplier(opened) - (opened.has('prayer.martyr') ? 0.3 : 0)
    const base = actor.baseMaxHp + undeadHealthBonus(opened)
    return Math.max(1, Math.floor(base * multiplier + 1e-10))
}

export function effectiveMaxMana(actor: GameCharacter): number {
    const base = actor.config.resources.maxMana
    return actor.progression.constellations.opened.has('prayer.martyr')
        ? base * 0.85
        : base
}

export function effectiveMaxEnergy(actor: GameCharacter): number {
    const opened = actor.progression.constellations.opened
    const base = actor.config.resources.maxEnergy + undeadEnergyBonus(opened)
    return opened.has('life.endurance')
        ? (base * ENDURANCE_ENERGY_PERCENT) / 100
        : base
}
