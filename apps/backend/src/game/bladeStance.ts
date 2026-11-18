import {
    type GameEventPayload,
    resolveCombatWeapon,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { leaveDefensiveStance } from './combatState'
import { constellationModifiers } from './constellationModifiers'
import { canPerformSkillAction } from './skillProgression'

export function toggleDefensiveStance(
    actor: GameCharacter,
    now: number
): GameEventPayload[] {
    if (
        !actor.alive ||
        actor.stunUntil > now ||
        actor.tags.has('offline') ||
        actor.tags.has('state.retired')
    ) {
        return []
    }
    if (actor.combat.defensiveStance) {
        leaveDefensiveStance(actor, now)
        return [
            {
                kind: 'status',
                actorId: actor.id,
                targetId: actor.id,
                abilityId: 'defensive_stance',
                statusId: 'defensive_stance',
                expiresAt: now,
            },
        ]
    }
    if (!canEnterStance(actor, now)) {
        return []
    }
    actor.combat.defensiveStance = true
    actor.combat.stanceController = actor.soul.controlSource
    actor.clearPath()
    actor.setMoveInput({ x: 0, y: 0 })
    actor.movement.dashUntil = 0
    return [
        {
            kind: 'status',
            actorId: actor.id,
            targetId: actor.id,
            abilityId: 'defensive_stance',
            statusId: 'defensive_stance',
        },
    ]
}

function canEnterStance(actor: GameCharacter, now: number): boolean {
    const weapon = resolveCombatWeapon(actor.archetype, actor.equipment.weapon)
    const modifiers = constellationModifiers(actor)
    const entryEnergy = modifiers.bladeLongFrontier ? 5 : 7
    return (
        canPerformSkillAction(actor, now) &&
        weapon.bladeCompatible &&
        !weapon.broken &&
        modifiers.bladeGuardRank !== 0 &&
        now >= actor.combat.stanceAvailableAt &&
        actor.energy >= entryEnergy
    )
}
