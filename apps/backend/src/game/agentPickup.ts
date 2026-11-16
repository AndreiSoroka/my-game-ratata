import type { AgentDecisionResult, CompanionWorld } from './agentDecisions'
import type { GameCharacter } from './character'

export function applyAgentPickup(
    actor: GameCharacter,
    worldItemId: string | undefined,
    world: CompanionWorld,
    now: number
): AgentDecisionResult {
    return world.requestPickup === undefined
        ? { accepted: false, error: 'Pickup service unavailable', events: [] }
        : {
              accepted: true,
              error: null,
              events: world.requestPickup(actor, worldItemId, now),
          }
}
