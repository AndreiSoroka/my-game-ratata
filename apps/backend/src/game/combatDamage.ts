import {
    ABILITY_DEFINITIONS,
    type GameEventPayload,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { PendingAttackHit } from './characterState'
import { resolveCharacterStats } from './characterStats'
export function dodgedAttack(
    target: GameCharacter,
    random: () => number
): boolean {
    return (
        random() <
        resolveCharacterStats(
            target.config,
            target.equipment,
            target.progression.skills.swordsmanship.level
        ).dodgeChance
    )
}
export function resolveAttackDamage(
    actor: GameCharacter,
    attack: PendingAttackHit,
    random: () => number
): { amount: number; critical: boolean } {
    const stats = resolveCharacterStats(
        actor.config,
        actor.equipment,
        actor.progression.skills.swordsmanship.level
    )
    const definition =
        attack.abilityId === undefined
            ? undefined
            : ABILITY_DEFINITIONS[attack.abilityId]
    const low = definition?.damage ?? stats.minDamage
    const high = definition?.maxDamage ?? stats.maxDamage
    let amount = Math.floor(low + random() * (high - low + 1))
    const critical = random() < stats.critChance
    if (critical) {
        amount = Math.round(amount * actor.config.combat.critMultiplier)
    }
    return {
        amount: Math.max(1, Math.round(amount * attack.damageMultiplier)),
        critical,
    }
}
export function applyAttackStun(
    actor: GameCharacter,
    target: GameCharacter,
    attack: PendingAttackHit,
    now: number,
    random: () => number
): GameEventPayload[] {
    if (!attack.canStun || !target.alive) {
        return []
    }
    const combat = actor.config.combat
    const heavy = attack.abilityId === 'skeleton_strike'
    if (!heavy && random() >= combat.stunChance) {
        return []
    }
    const duration = heavy
        ? 800
        : Math.floor(
              combat.stunMinDurationMs +
                  random() *
                      (combat.stunMaxDurationMs - combat.stunMinDurationMs + 1)
          )
    target.stunUntil = Math.max(target.stunUntil, now + duration)
    target.clearPath()
    target.setMoveInput({ x: 0, y: 0 })
    target.clearPendingAttackHit()
    return [
        {
            kind: 'status',
            actorId: actor.id,
            targetId: target.id,
            statusId: 'stun',
            expiresAt: target.stunUntil,
        },
    ]
}
