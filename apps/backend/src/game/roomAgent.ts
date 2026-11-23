import { type AgentDecisionResult, parseAgentDecision } from './agentDecisions'
import { observeCombatEvents } from './combatObservation'
import type { CompanionService } from './companions'
import { kaplyaSafetyActive, visibleKaplyaThreat } from './companionSafety'
import { npcDialogueMode, scriptedResident } from './npcRoster'
import type { GameRoom } from './room'

export function createRoomAgentRequester(
    room: GameRoom,
    companions: CompanionService,
    paused: () => boolean
) {
    return (actorId: string, decision: unknown): AgentDecisionResult =>
        paused()
            ? { accepted: false, error: 'Игровой мир на паузе.', events: [] }
            : decideForRoomAgent(room, companions, actorId, decision)
}

function decideForRoomAgent(
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
    const now = room.gameplayNow()
    const parsed = parseAgentDecision(decision)
    if (
        npcDialogueMode(actor.id) === 'passive' ||
        (parsed?.type === 'speak' && scriptedResident(actor.id)) ||
        (actor.id === 'npc_magic_slime_1' &&
            (kaplyaSafetyActive(actor) ||
                visibleKaplyaThreat(actor, room, now) !== undefined))
    ) {
        return {
            accepted: false,
            error: 'NPC role or current safety policy owns this action',
            events: [],
        }
    }
    const result = companions.decide(actor, decision, room, now)
    room.publishEvents(result.events)
    return {
        ...result,
        events: observeCombatEvents(result.events, {
            observer: actor,
            getCharacter: (id) => room.getCharacter(id),
            navigation: room.navigationFor(actor),
            now,
            hasModelLease: (character, now) =>
                companions.hasActiveLease(character, now, room),
        }),
    }
}
