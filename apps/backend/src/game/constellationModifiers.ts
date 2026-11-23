import { resolveAshParameters } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { resolveConstellationBonuses } from './constellationBonuses'
import { activeConstellationStars } from './constellations'

export function ashParameters(actor: GameCharacter) {
    return resolveAshParameters(activeConstellationStars(actor))
}

export function constellationModifiers(actor: GameCharacter) {
    const lastLightEligible =
        actor.progression.constellations.lowHpFromHostile &&
        actor.progression.constellations.hostileWound > 0 &&
        actor.hp < actor.maxHp * 0.2
    return resolveConstellationBonuses(
        activeConstellationStars(actor),
        lastLightEligible
    )
}
