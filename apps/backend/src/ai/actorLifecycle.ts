import type { GameCharacter } from '../game/character'
import type { CompanionService } from '../game/companions'
import type { GameRoom } from '../game/room'
import { npcAiActorAvailable, type NpcAiActorState } from './runtimeState'
import type { NpcAiSessionActions } from './session'
export function prepareNpcActor(
    room: GameRoom,
    companions: CompanionService,
    sessions: NpcAiSessionActions,
    state: NpcAiActorState,
    now: number
): GameCharacter | undefined {
    const actor = room.getCharacter(state.config.actorId)
    if (actor !== state.actor) {
        sessions.cancel(state, now)
        state.actor = actor
        state.memory = ''
        state.conversations.clear()
        state.facts = []
    }
    if (!npcAiActorAvailable(actor)) {
        sessions.cancel(state, now)
        state.awaitingFreshRequest = true
        return undefined
    }
    if (
        state.dialogue !== undefined &&
        !requesterAvailable(room.getCharacter(state.dialogue.senderId))
    ) {
        sessions.cancel(state, now)
    }
    if (
        state.task?.requesterId != null &&
        !requesterAvailable(room.getCharacter(state.task.requesterId))
    ) {
        sessions.cancel(state, now)
    }
    if (
        state.token !== undefined &&
        !companions.renewModelControl(actor, state.token, now)
    ) {
        sessions.cancel(state, now)
    }
    if (idleLease(state)) {
        sessions.release(state, now)
    }
    state.controlRevision = companions.controlRevision(actor)
    return actor
}

function requesterAvailable(actor: GameCharacter | undefined): boolean {
    return (
        actor !== undefined &&
        actor.alive &&
        !actor.tags.has('offline') &&
        !actor.tags.has('state.retired') &&
        (actor.controllerKind !== 'network_player' || actor.connected)
    )
}

function idleLease(state: NpcAiActorState): boolean {
    return (
        state.token !== undefined &&
        state.task === null &&
        state.dialogue === undefined &&
        state.controller === undefined &&
        state.inbox.length === 0
    )
}
