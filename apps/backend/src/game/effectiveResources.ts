import type { GameCharacter } from './character'

/** Base configuration stays intact; the identity's learned trait determines its current capacity. */
export function effectiveMaxHp(actor: GameCharacter): number {
    return actor.progression.constellations.opened.has('prayer.martyr')
        ? Math.max(1, Math.floor((actor.baseMaxHp * 7) / 10))
        : actor.baseMaxHp
}

export function effectiveMaxMana(actor: GameCharacter): number {
    const base = actor.config.resources.maxMana
    return actor.progression.constellations.opened.has('prayer.martyr')
        ? base * 0.85
        : base
}
