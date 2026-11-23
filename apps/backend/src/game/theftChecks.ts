import {
    resolveTheftChances,
    type TheftResult,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { constellationModifiers } from './constellationModifiers'
import { facingDirection } from './math'
import { hasPrayerAdvantage, prayerCheckSample } from './prayerAuras'

export function rollTheft(
    actor: GameCharacter,
    target: GameCharacter,
    random: () => number,
    now: number
): TheftResult['outcome'] {
    const { detected, success } = resolveTheftChances(
        !approachesFromRear(target, actor),
        constellationModifiers(actor)
    )
    const advantage = hasPrayerAdvantage(actor, now)
    const defenderAdvantage = hasPrayerAdvantage(target, now)
    const first = random()
    const detectionRoll =
        advantage === defenderAdvantage
            ? first
            : advantage
              ? Math.max(first, random())
              : Math.min(first, random())
    if (detectionRoll < detected) {
        return 'caught'
    }
    return prayerCheckSample(random, advantage) < success ? 'stolen' : 'failed'
}

function approachesFromRear(
    target: GameCharacter,
    actor: GameCharacter
): boolean {
    const dx = actor.position.x - target.position.x
    const dy = actor.position.y - target.position.y
    const direction = facingDirection(target.facing)
    const distance = Math.hypot(dx, dy)
    return (
        distance > 0 && (dx * direction.x + dy * direction.y) / distance <= -0.4
    )
}
