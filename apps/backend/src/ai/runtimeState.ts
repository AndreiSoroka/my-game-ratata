import type { GameCharacter } from '../game/character'
import { canObserveRoomCharacter } from '../game/characterSight'
import { canRequest } from '../game/companionState'
import type { GameRoom } from '../game/room'
import { canPerformSkillAction } from '../game/skillProgression'
import type { PendingNpcAiAction } from './actions'
import type { PendingNpcAiAttack } from './attackResolution'
import { CharacterMemory } from './characterMemory'
import { memoryForCharacter } from './characterMinds'
import type { NpcAiGuide } from './guide'
import type {
    NpcAiActorConfig,
    NpcAiEvent,
    NpcAiFact,
    NpcAiReply,
    NpcAiTask,
    NpcReplyIssue,
} from './types'

export interface NpcAiActorState {
    idleSince?: number | undefined
    finalizing?:
        | {
              reply: NpcAiReply
              retirementRevision: number
              resolve: (
                  problem:
                      import('./turnInformation').NpcReplyProblem | undefined
              ) => void
          }
        | undefined
    modelCallsByInput: Map<string, number>
    mind: CharacterMemory
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
    attack?: PendingNpcAiAttack | undefined
    guide: NpcAiGuide | undefined
    travelRequest?: Extract<NpcAiEvent, { kind: 'message' }> | undefined
    tradePausedAt: number | undefined
    controller: AbortController | undefined
    ready:
        | { reply: NpcAiReply }
        | { error: string; events: NpcAiEvent[] }
        | { invalidReply: NpcReplyIssue }
        | undefined
    retry: number
    nextAt: number
    budgetUntil?: number
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
        modelCallsByInput: new Map(),
        mind:
            actor === undefined
                ? new CharacterMemory(config.actorId)
                : memoryForCharacter(actor),
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
    if (!canRequest(requester, actor)) {
        return false
    }
    const navigation = room.navigationFor(actor)
    return (
        actor.soul.canSpeak &&
        canPerformSkillAction(requester, now) &&
        canPerformSkillAction(actor, now) &&
        canObserveRoomCharacter(requester, actor, navigation, now) &&
        navigation.hasLineOfSight(actor.position, requester.position)
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

export function clearNpcActiveTask(state: NpcAiActorState): void {
    state.task = null
    state.events = []
    state.pending = undefined
    state.attack = undefined
    state.guide = undefined
    state.reportedDiagnostics.clear()
}

export function interruptInference(state: NpcAiActorState): void {
    state.finalizing?.resolve({
        code: 'command_unavailable',
        reason: { code: 'cancelled', detail: 'Разговор завершён.' },
    })
    state.finalizing = undefined
    state.generation += 1
    state.controller?.abort()
    state.ready = undefined
    state.dialogue = undefined
    state.retry = 0
    state.turnControlRevision = undefined
}
