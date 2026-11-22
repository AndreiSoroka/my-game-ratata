import type { GameCharacter } from './character'
import {
    ENDURANCE_ENERGY_PERCENT,
    resolveConstellationBonuses,
} from './constellationBonuses'

/** Base configuration stays intact; the identity's learned trait determines its current capacity. */
export function effectiveMaxHp(actor: GameCharacter): number {
    const multiplier =
        resolveConstellationBonuses(actor.progression.constellations.opened)
            .bladeHealthMultiplier -
        (actor.progression.constellations.opened.has('prayer.martyr') ? 0.3 : 0)
    return Math.max(1, Math.floor(actor.baseMaxHp * multiplier + 1e-10))
}

export function effectiveMaxMana(actor: GameCharacter): number {
    const base = actor.config.resources.maxMana
    return actor.progression.constellations.opened.has('prayer.martyr')
        ? base * 0.85
        : base
}

export function effectiveMaxEnergy(actor: GameCharacter): number {
    const base = actor.config.resources.maxEnergy
    return actor.progression.constellations.opened.has('life.endurance')
        ? (base * ENDURANCE_ENERGY_PERCENT) / 100
        : base
}
