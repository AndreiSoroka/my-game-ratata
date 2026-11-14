import type { AgentDecision } from '@my-game-ratata/contracts'

import { actorRefusesCombat } from './agentCapabilities'
import type { AgentDecisionResult, CompanionWorld } from './agentDecisions'
import type { GameCharacter } from './character'
import { isTargetInAttackRange } from './combat'
import { canTargetByFaction } from './factions'

export function applyAgentAttack(
    actor: GameCharacter,
    command: Extract<AgentDecision, { type: 'attack' }>,
    world: CompanionWorld,
    now: number
): AgentDecisionResult {
    if (actorRefusesCombat(actor)) {
        return reject('This personality refuses combat')
    }
    if (command.target !== undefined) {
        const previous = actor.lastAttackAt
        world.requestAttack(actor, now, undefined, command.target)
        return actor.lastAttackAt !== previous
            ? { accepted: true, error: null, events: [] }
            : reject('Grave attack rejected by shared rules')
    }
    const target =
        command.targetId === undefined
            ? undefined
            : world.getCharacter(command.targetId)
    if (
        target === undefined ||
        !target.alive ||
        target.tags.has('offline') ||
        target.locationId !== actor.locationId ||
        !canTargetByFaction(actor, target)
    ) {
        return reject('Target is not a hostile character in this location')
    }
    const facing = actor.facing
    actor.updateFacing({
        x: target.position.x - actor.position.x,
        y: target.position.y - actor.position.y,
    })
    if (
        !isTargetInAttackRange(
            actor,
            target,
            world.navigationFor(actor).grid.tileWidth
        )
    ) {
        actor.facing = facing
        return reject('Target is outside attack reach')
    }
    world.requestAttack(actor, now, target.id)
    return { accepted: true, error: null, events: [] }
}

function reject(error: string): AgentDecisionResult {
    return { accepted: false, error, events: [] }
}
