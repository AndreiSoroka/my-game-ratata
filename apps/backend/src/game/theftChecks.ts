import {
    resolveTheftChances,
    THEFT_RULES,
    type TheftResult,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { JusticeContext } from './cityJustice'
import { constellationModifiers } from './constellationModifiers'
import { distance, facingDirection } from './math'
import {
    canPerceivePrayerCaster,
    hasPrayerAdvantage,
    prayerCheckSample,
} from './prayerAuras'
import { canPerformSkillAction } from './skillProgression'

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

export function validTheftTarget(
    actor: GameCharacter,
    target: GameCharacter | undefined,
    context: JusticeContext
): target is GameCharacter {
    return (
        canPerformSkillAction(actor, context.now) &&
        actor.movement.mode === 'sneaking' &&
        actor.movement.dashUntil <= context.now &&
        target !== undefined &&
        target.id !== actor.id &&
        target.alive &&
        !target.tags.has('offline') &&
        target.locationId === actor.locationId &&
        canPerceivePrayerCaster(actor, target, context.now) &&
        distance(actor.position, target.position) <= THEFT_RULES.range &&
        context.navigation.hasLineOfSight(actor.position, target.position)
    )
}
