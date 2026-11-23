import type { AgentDecision } from '@my-game-ratata/contracts'

import type { AgentDecisionResult, CompanionWorld } from './agentDecisions'
import type { GameCharacter } from './character'
import { canUseCombat } from './combatPermission'
import { canAttackCharacter } from './combatTargets'

export function applyAgentAttack(
    actor: GameCharacter,
    command: Extract<AgentDecision, { type: 'attack' }>,
    world: CompanionWorld,
    now: number
): AgentDecisionResult {
    if (!canUseCombat(actor)) {
        return reject('This personality refuses combat')
    }
    if (command.targetId !== undefined) {
        const target = world.getCharacter(command.targetId)
        if (
            target === undefined ||
            !target.alive ||
            target.tags.has('offline') ||
            target.locationId !== actor.locationId ||
            !canAttackCharacter(actor, target, now)
        ) {
            return reject(
                'Target is not an attackable character in this location'
            )
        }
    }
    const previous = actor.pendingAttack?.actionId
    const facing = actor.facing
    world.requestAttack(actor, now, command.targetId, command.target)
    const current = actor.pendingAttack?.actionId
    if (current !== undefined && current !== previous) {
        return { accepted: true, error: null, events: [] }
    }
    actor.facing = facing
    return reject('Attack rejected by shared rules')
}

function reject(error: string): AgentDecisionResult {
    return { accepted: false, error, events: [] }
}
