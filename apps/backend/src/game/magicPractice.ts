import {
    type GameEventPayload,
    MASTERY_REWARDS,
    type Vector2,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { canTargetByFaction } from './factions'
import { chainsAt } from './magicState'
import { awardMasteries } from './skillProgression'

export function hostileMagicContact(
    caster: GameCharacter,
    target: GameCharacter,
    now: number
): boolean {
    return (
        caster.faction !== target.faction &&
        canTargetByFaction(caster, target, now)
    )
}

export function recordChainsMovementBlock(
    actor: GameCharacter,
    now: number,
    position = actor.position
): GameEventPayload[] {
    const events: GameEventPayload[] = []
    for (const { caster, channel } of chainsAt(actor, now, position)) {
        if (channel.practiced || !hostileMagicContact(caster, actor, now)) {
            continue
        }
        channel.practiced = true
        events.push(...rewardUtility(caster, 'chains', now))
    }
    return events
}

export function rewardUtility(
    caster: GameCharacter,
    id: 'chains' | 'dispel_magic',
    now: number,
    random?: () => number
): GameEventPayload[] {
    return awardMasteries(
        caster,
        [
            {
                constellationId: 'magic',
                experience:
                    id === 'chains'
                        ? MASTERY_REWARDS.chainsBlock
                        : MASTERY_REWARDS.dispelEnemy,
            },
        ],
        { now, evidence: [id], random }
    )
}

export function recordChainsClipping(
    actor: GameCharacter,
    desired: Vector2,
    actual: Vector2,
    now: number
): GameEventPayload[] {
    return desired.x === actual.x && desired.y === actual.y
        ? []
        : recordChainsMovementBlock(actor, now, actual)
}
