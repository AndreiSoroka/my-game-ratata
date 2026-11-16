import type { TheftResult } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { constellationModifiers } from './constellationModifiers'
import { hasPrayerAdvantage, prayerCheckSample } from './prayerAuras'

export function rollTheft(
    actor: GameCharacter,
    target: GameCharacter,
    random: () => number,
    now: number
): TheftResult['outcome'] {
    const front = facingThief(target, actor)
    const detected = Math.max(0.1, Math.min(0.9, 0.68 + (front ? 0.12 : -0.08)))
    const success = Math.max(
        0.05,
        Math.min(
            0.9,
            0.25 +
                0.04 +
                0.015 +
                (front ? 0 : 0.1) +
                constellationModifiers(actor).theftChanceBonus
        )
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

function facingThief(target: GameCharacter, actor: GameCharacter): boolean {
    const dx = actor.position.x - target.position.x
    const dy = actor.position.y - target.position.y
    const direction = {
        up: { x: 0, y: -1 },
        down: { x: 0, y: 1 },
        left: { x: -1, y: 0 },
        right: { x: 1, y: 0 },
    }[target.facing]
    return dx * direction.x + dy * direction.y > 0
}
