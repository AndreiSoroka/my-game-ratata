import type { GameRoom } from '../game/room'
import type { NpcAiActorState } from './runtimeState'
export function npcActionPaused(
    state: NpcAiActorState,
    actorId: string,
    now: number,
    room: GameRoom
): boolean {
    if (room.social.exchanges.isPaused(actorId)) {
        state.tradePausedAt ??= now
        return true
    }
    if (state.tradePausedAt !== undefined) {
        if (state.pending !== undefined) {
            state.pending.deadline += now - state.tradePausedAt
        }
        if (state.guide !== undefined) {
            state.guide.deadline += now - state.tradePausedAt
            if (state.guide.legDeadline !== undefined) {
                state.guide.legDeadline += now - state.tradePausedAt
            }
            if (state.guide.crossingGraceUntil !== undefined) {
                state.guide.crossingGraceUntil += now - state.tradePausedAt
            }
            if (state.guide.waitingSince !== undefined) {
                state.guide.waitingSince += now - state.tradePausedAt
            }
        }
        state.tradePausedAt = undefined
    }
    return false
}
