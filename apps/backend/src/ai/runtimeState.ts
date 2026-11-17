import type { GameCharacter } from '../game/character'
import { canRequest } from '../game/companionState'
import type { GameRoom } from '../game/room'
import { canPerformSkillAction } from '../game/skillProgression'
import type { PendingNpcAiAction } from './actions'
import type { NpcAiGuide } from './guide'
import type {
    NpcAiActorConfig,
    NpcAiEvent,
    NpcAiFact,
    NpcAiReply,
    NpcAiTask,
} from './types'

export interface NpcAiActorState {
    inbox: Array<Extract<NpcAiEvent, { kind: 'message' }>>
    dialogue: Extract<NpcAiEvent, { kind: 'message' }> | undefined
    config: NpcAiActorConfig
    actor: GameCharacter | undefined
    generation: number
    token: string | undefined
    task: NpcAiTask | null
    events: NpcAiEvent[]
    memory: string
    conversations: Map<string, string>
    reportedDiagnostics: Set<string>
    facts: NpcAiFact[]
    pending: PendingNpcAiAction | undefined
    guide: NpcAiGuide | undefined
    tradePausedAt: number | undefined
    controller: AbortController | undefined
    ready:
        | { reply: NpcAiReply }
        | { error: string; events: NpcAiEvent[] }
        | undefined
    retry: number
    nextAt: number
    reviewAt: number
    inspectAt: number
    cityFingerprint: string | undefined
    awaitingFreshRequest: boolean
    controlRevision: number
    turnControlRevision: number | undefined
}

export function createNpcAiState(
    config: NpcAiActorConfig,
    actor: GameCharacter | undefined
): NpcAiActorState {
    return {
        inbox: [],
        dialogue: undefined,
        config,
        actor,
        generation: 0,
        token: undefined,
        task: null,
        events: [],
        memory: '',
        conversations: new Map(),
        reportedDiagnostics: new Set(),
        facts: [],
        pending: undefined,
        guide: undefined,
        tradePausedAt: undefined,
        controller: undefined,
        ready: undefined,
        retry: 0,
        nextAt: 0,
        reviewAt: 0,
        inspectAt: 0,
        cityFingerprint: undefined,
        awaitingFreshRequest: false,
        controlRevision: 0,
        turnControlRevision: undefined,
    }
}

export function npcAiActorAvailable(
    actor: GameCharacter | undefined
): actor is GameCharacter {
    return (
        actor !== undefined &&
        actor.alive &&
        actor.controllerKind !== 'network_player' &&
        actor.soul.controlSource !== 'human' &&
        !actor.tags.has('offline') &&
        !actor.tags.has('state.retired')
    )
}

export function canAddressNpcAi(
    room: GameRoom,
    requester: GameCharacter,
    actor: GameCharacter | undefined,
    now: number
): actor is GameCharacter {
    return (
        canRequest(requester, actor) &&
        actor.soul.canSpeak &&
        canPerformSkillAction(requester, now) &&
        canPerformSkillAction(actor, now) &&
        room
            .navigationFor(actor)
            .hasLineOfSight(actor.position, requester.position)
    )
}

export function npcAiBusyFor(
    state: NpcAiActorState,
    requesterId: string
): boolean {
    const leaderId = state.actor?.soul.companion?.leaderId
    const owner = state.task?.requesterId
    return (
        (leaderId != null && leaderId !== requesterId) ||
        (owner != null && owner !== requesterId)
    )
}

export function enqueueNpcAiEvent(
    state: NpcAiActorState,
    event: NpcAiEvent
): void {
    state.events.push(event)
    if (state.events.length > 16) {
        state.events.shift()
    }
}
