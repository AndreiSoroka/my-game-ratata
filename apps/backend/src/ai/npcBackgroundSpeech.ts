import type { GameRoom } from '../game/room'
import { createSpeechEvent } from '../game/speechReceipts'
import { replySpeech } from './dialogueResult'
import { attributeNpcSpeech } from './memorySpeechAttribution'
import { npcGreetingStillAvailable } from './npcInitiative'
import type { NpcAiActorState } from './runtimeState'
import { rememberNpcReply } from './sessionMemory'
import type { NpcAiReply } from './types'

export function completeNpcGreeting(
    room: GameRoom,
    state: NpcAiActorState,
    reply: NpcAiReply,
    now: number
): boolean {
    if (state.task?.background !== 'greeting') {
        return false
    }
    const targetId = state.task.targetId
    const actor = state.actor
    const text = replySpeech(reply)
    if (
        actor !== undefined &&
        targetId !== undefined &&
        text !== null &&
        npcGreetingStillAvailable(room, state, targetId, now)
    ) {
        room.publishEvents([
            attributeNpcSpeech(
                createSpeechEvent(actor, text.slice(0, 400)),
                targetId
            ),
        ])
        rememberNpcReply(state, reply.memory)
    }
    return true
}
