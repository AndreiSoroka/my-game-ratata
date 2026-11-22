import type { GameCharacter } from './character'
import { resolveConstellationBonuses } from './constellationBonuses'

export function constellationModifiers(actor: GameCharacter) {
    const lastLightEligible =
        actor.progression.constellations.lowHpFromHostile &&
        actor.progression.constellations.hostileWound > 0 &&
        actor.hp < actor.maxHp * 0.2
    return resolveConstellationBonuses(
        actor.progression.constellations.opened,
        lastLightEligible
    )
}
