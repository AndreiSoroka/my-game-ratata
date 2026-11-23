import type { GameRoom } from '../game/room'
import { npcCombatReactionStillAvailable } from './combatReactions'
import { npcAiActorAvailable, type NpcAiActorState } from './runtimeState'

export function prioritizeNpcAiStates(
    a: NpcAiActorState,
    b: NpcAiActorState
): number {
    return turnPriority(b) - turnPriority(a)
}

function turnPriority(state: NpcAiActorState): number {
    return state.inbox.length > 0 ? 2 : Number(state.task?.requesterId != null)
}

export function continuationAvailable(
    room: GameRoom,
    state: NpcAiActorState,
    now: number
): boolean {
    return (
        state.task !== null &&
        state.events.length > 0 &&
        state.guide === undefined &&
        state.pending === undefined &&
        state.attack === undefined &&
        (state.task.background !== 'combat_reaction' ||
            npcCombatReactionStillAvailable(room, state, now)) &&
        !room.social.exchanges.isPaused(state.config.actorId)
    )
}

export function isBackgroundNpcTurn(state: NpcAiActorState): boolean {
    return state.dialogue === undefined && state.task?.requesterId == null
}

export function prepareNpcAiTurns(
    room: GameRoom,
    states: Iterable<NpcAiActorState>,
    now: number
): NpcAiActorState[] {
    const candidates: NpcAiActorState[] = []
    const wall = room.realNow()
    for (const state of states) {
        const actor = state.actor
        if (
            !npcAiActorAvailable(actor) ||
            room.social.society.conflicts?.hasPhysicalReaction(actor, now) ===
                true
        ) {
            continue
        }
        state.inbox = state.inbox.filter(
            (event) =>
                room.getCharacter(event.senderId)?.connected === true &&
                room.social.npcSpeech.turns.available(actor, event, now)
        )
        const continuation =
            room.allowsAutonomousNpcAi() &&
            (state.budgetUntil ?? 0) <= wall &&
            continuationAvailable(room, state, now)
        if (runnableTurn(state, now, continuation)) {
            candidates.push(state)
        }
    }
    return candidates.sort(prioritizeNpcAiStates)
}

function runnableTurn(
    state: NpcAiActorState,
    now: number,
    continuation: boolean
): boolean {
    return (
        (continuation || state.inbox.length > 0) &&
        state.ready === undefined &&
        state.controller === undefined &&
        state.nextAt <= now &&
        !state.awaitingFreshRequest
    )
}
