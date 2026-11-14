import type { AgentDecisionResult } from './agentDecisions'
import { observeCombatEvents } from './combatObservation'
import type { CompanionService } from './companions'
import type { GameRoom } from './room'

export function decideForRoomAgent(
    room: GameRoom,
    companions: CompanionService,
    actorId: string,
    decision: unknown
): AgentDecisionResult {
    const actor = room.getCharacter(actorId)
    if (actor === undefined || actor.controllerKind === 'network_player') {
        return {
            accepted: false,
            error: 'Only existing NPCs accept agent control',
            events: [],
        }
    }
    const result = companions.decide(actor, decision, room, Date.now())
    room.publishEvents(result.events)
    return {
        ...result,
        events: observeCombatEvents(result.events, {
            observer: actor,
            getCharacter: (id) => room.getCharacter(id),
            navigation: room.navigationFor(actor),
            now: Date.now(),
            hasModelLease: (character, now) =>
                companions.hasActiveLease(character, now, room),
        }),
    }
}
