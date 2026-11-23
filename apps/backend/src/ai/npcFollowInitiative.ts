import type { AgentDecision } from '@my-game-ratata/contracts'

import type { CompanionService } from '../game/companions'
import type { GameRoom } from '../game/room'
import { npcAssistanceContext } from './dialogueOrders'
import { buildNpcAiObservation } from './observation'
import type { NpcAiObservation } from './observationTypes'
import type { NpcAiActorState } from './runtimeState'
import type { NpcReplyProblem } from './turnInformation'

type FollowInitiativeDecision = Extract<
    AgentDecision,
    { type: 'propose_follow' | 'start_following' }
>

export interface NpcFollowOpportunity {
    targetId: string
    canPropose: boolean
    canStart: boolean
}

export function npcFollowInitiative(
    room: GameRoom,
    companions: CompanionService,
    state: NpcAiActorState,
    observation: NpcAiObservation,
    now: number
): NpcFollowOpportunity[] {
    const actor = state.actor
    if (actor === undefined || !hasFollowOpportunity(state)) {
        return []
    }
    const context = npcAssistanceContext(room)
    const speakerId = state.dialogue?.senderId
    const opportunities: NpcFollowOpportunity[] = []
    for (const target of observation.targets) {
        if (
            target.kind !== 'character' ||
            (speakerId !== undefined && target.id !== speakerId)
        ) {
            continue
        }
        const leader = room.getCharacter(target.id)
        if (leader?.controllerKind !== 'network_player') {
            continue
        }
        const canPropose = companions.checkSelfFollowing(
            actor,
            leader,
            now,
            context,
            'propose'
        ).accepted
        if (canPropose) {
            opportunities.push({
                targetId: leader.id,
                canPropose,
                canStart:
                    hadEarlierConversation(state, leader.id) &&
                    companions.checkSelfFollowing(
                        actor,
                        leader,
                        now,
                        context,
                        'start'
                    ).accepted,
            })
        }
    }
    return opportunities
}

function hadEarlierConversation(
    state: NpcAiActorState,
    targetId: string
): boolean {
    return (
        state.conversations.has(`say:${targetId}`) ||
        state.conversations.has(`whisper:${targetId}`)
    )
}

export function npcFollowInitiativeProblem(
    room: GameRoom,
    companions: CompanionService,
    state: NpcAiActorState,
    decision: FollowInitiativeDecision,
    now: number
): NpcReplyProblem | undefined {
    const actor = state.actor
    if (actor !== undefined && hasFollowOpportunity(state)) {
        const observation = buildNpcAiObservation(
            room,
            actor,
            state.config.role,
            now
        )
        if (
            npcFollowInitiative(room, companions, state, observation, now).some(
                (target) =>
                    target.targetId === decision.targetId &&
                    (decision.type === 'propose_follow'
                        ? target.canPropose
                        : target.canStart)
            )
        ) {
            return undefined
        }
    }
    return {
        code: 'command_unavailable',
        reason: {
            code: 'follow_initiative_unavailable',
            detail: 'С этим собеседником сейчас нельзя предложить или начать сопровождение. Учитывай доступные варианты и уважай отказ.',
        },
    }
}

function hasFollowOpportunity(state: NpcAiActorState): boolean {
    if (
        state.config.role !== 'companion' ||
        state.config.mode === 'dialogue_only' ||
        state.task?.requesterId != null ||
        state.pending !== undefined ||
        state.guide !== undefined
    ) {
        return false
    }
    return state.dialogue === undefined
        ? state.task?.background === 'self_activity'
        : state.dialogue.system !== true && state.dialogue.ambiguous !== true
}
