import type { GameRoom } from '../game/room'
import type { NpcAiActorState } from './runtimeState'

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
