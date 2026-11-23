import type { GameRoom } from '../game/room'
import type { NpcAiActorState } from './runtimeState'

export function prioritizeNpcAiStates(
    a: NpcAiActorState,
    b: NpcAiActorState
): number {
    return (
        Number(b.inbox.length > 0 || b.task?.requesterId != null) -
        Number(a.inbox.length > 0 || a.task?.requesterId != null)
    )
}

export function continuationAvailable(
    room: GameRoom,
    state: NpcAiActorState
): boolean {
    return (
        state.task !== null &&
        state.events.length > 0 &&
        state.guide === undefined &&
        state.pending === undefined &&
        !room.social.exchanges.isPaused(state.config.actorId)
    )
}
