import {
    npcQuestMessage,
    type NpcRequestState,
} from '@my-game-ratata/contracts'

import type { GameRoom } from '../game/room'
import type { NpcAiDiagnostics } from './diagnostics'
import type { NpcAiActorState } from './runtimeState'
import type { NpcAiEvent } from './types'

export function reportNpcRequestStatus(
    room: GameRoom,
    diagnostics: NpcAiDiagnostics,
    state: NpcAiActorState,
    status: NpcRequestState,
    now: number,
    reason?: string,
    message?: Extract<NpcAiEvent, { kind: 'message' }>
): void {
    const request = requestIdentity(state, message)
    if (request === undefined) {
        return
    }
    const { task, requesterId } = request
    const reasonMessage = npcQuestMessage(reason)
    room.social.reportNpcRequestStatus(requesterId, {
        id: task.id,
        npcId: state.config.actorId,
        state: status,
        request: ('text' in task ? task.text : task.request).slice(0, 400),
        ...(reason === undefined ? {} : { reason }),
        ...(reasonMessage === undefined ? {} : { reasonMessage }),
        at: now,
    })
    diagnostics.record({
        actorId: state.config.actorId,
        taskId: task.id,
        request: 'text' in task ? task.text : task.request,
        category: 'request_status',
        reason: `${status}${reason === undefined ? '' : `:${reason}`}`,
        at: now,
    })
}

function requestIdentity(
    state: NpcAiActorState,
    message: Extract<NpcAiEvent, { kind: 'message' }> | undefined
) {
    const event = message ?? state.dialogue
    const task = event ?? state.task
    const requesterId = event?.senderId ?? state.task?.requesterId
    return task == null || requesterId == null || event?.system === true
        ? undefined
        : { task, requesterId }
}
