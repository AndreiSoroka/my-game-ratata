import type { AgentDecision } from '@my-game-ratata/contracts'

import type { AgentDecisionResult } from '../game/agentDecisions'
import type { GameCharacter } from '../game/character'
import type { GameRoom } from '../game/room'
import type { NpcAiDialogue } from './dialogue'
import { taskConversationKey } from './dialogueMemory'
import { replySpeech } from './dialogueResult'
import { attributeNpcSpeech } from './memorySpeechAttribution'
import { replySpeechLanguage } from './npcSpeechLanguage'
import { buildNpcAiObservation } from './observation'
import type { NpcAiActorState } from './runtimeState'
import type { NpcAiReply } from './types'
export function taskSpeech(
    dialogue: NpcAiDialogue,
    state: NpcAiActorState,
    text: string,
    now: number
): void {
    const task = state.task
    if (task?.requesterId == null) {
        return
    }
    dialogue.speak(
        state,
        {
            kind: 'message',
            id: task.id,
            senderId: task.requesterId,
            text: '',
            ...(task.language === undefined ? {} : { language: task.language }),
            locationId: state.actor?.locationId ?? '',
            position: { x: 0, y: 0 },
            at: now,
            channel:
                task.audienceKey?.startsWith('whisper:') === true
                    ? 'whisper'
                    : 'say',
        },
        text,
        now
    )
}
export function concludingTaskSpeech(
    dialogue: NpcAiDialogue,
    state: NpcAiActorState,
    reply: import('./types').NpcAiReply,
    now: number
): void {
    const text = replySpeech(reply)
    if (text !== null) {
        taskSpeech(dialogue, state, text, now)
    }
}
export function addressedDecision(
    state: NpcAiActorState,
    decision: AgentDecision
): AgentDecision {
    const requesterId = state.task?.requesterId
    return decision.type === 'speak' &&
        requesterId != null &&
        state.task?.audienceKey !== 'say'
        ? { ...decision, targetId: requesterId }
        : decision
}

export function rememberNpcReply(state: NpcAiActorState, memory: string): void {
    const task = state.task
    if (task === null) {
        return
    }
    state.memory = memory.slice(0, 2000)
    state.conversations.set(
        task.background === 'self_activity'
            ? 'self'
            : taskConversationKey(task),
        state.memory
    )
}
export function rememberNpcMerchant(
    room: GameRoom,
    state: NpcAiActorState,
    actor: GameCharacter,
    decision: Extract<AgentDecision, { type: 'interact' }>,
    now: number
): void {
    const observation = buildNpcAiObservation(
        room,
        actor,
        state.config.role,
        now
    )
    if (observation.market === undefined) {
        return
    }
    state.facts = state.facts.filter(
        (fact) =>
            fact.kind !== 'merchant' || fact.merchantId !== decision.targetId
    )
    state.facts.push({
        kind: 'merchant',
        merchantId: decision.targetId,
        observedAt: now,
        offers: observation.market,
    })
    state.facts = state.facts.slice(-4)
}

export function rememberNpcInspection(
    room: GameRoom,
    state: NpcAiActorState,
    targetId: string,
    now: number
): void {
    const workerActivity = room.social.workerActivity(targetId, now)
    if (workerActivity === undefined) {
        return
    }
    state.facts = state.facts.filter(
        (fact) => fact.kind !== 'inspection' || fact.targetId !== targetId
    )
    state.facts.push({
        kind: 'inspection',
        targetId,
        observedAt: now,
        information: [workerActivity.text],
        workerActivity: structuredClone(workerActivity),
    })
    state.facts = state.facts.slice(-8)
}

export function publishNpcDecisionResult(
    room: GameRoom,
    state: NpcAiActorState,
    reply: NpcAiReply,
    decision: AgentDecision,
    result: AgentDecisionResult,
    now: number
): void {
    if (decision.type === 'speak') {
        const language = replySpeechLanguage(room, state, reply, now)
        const targetId = state.task?.requesterId ?? decision.targetId
        for (const event of result.events) {
            if (event.kind !== 'chat') {
                continue
            }
            event.language = language
            if (targetId !== undefined) {
                attributeNpcSpeech(event, targetId)
            }
        }
    }
    room.publishEvents(result.events)
}
