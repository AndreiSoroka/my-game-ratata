import type { GameCharacter } from '../game/character'
import type { CompanionService } from '../game/companions'
import type { GameRoom } from '../game/room'
import { CharacterMemory } from './characterMemory'
import { memoryForCharacter } from './characterMinds'
import { stopNpcSelfTravelEscort } from './guide'
import { isNpcTurnLeased } from './npcTurnLease'
import { npcAiActorAvailable, type NpcAiActorState } from './runtimeState'
import type { NpcAiSessionActions } from './session'
export function prepareNpcActor(
    room: GameRoom,
    companions: CompanionService,
    sessions: NpcAiSessionActions,
    state: NpcAiActorState,
    now: number
): GameCharacter | undefined {
    const actor = room.getCharacter(state.config.actorId)
    if (actor !== state.actor) {
        sessions.cancel(state, now)
        state.actor = actor
        state.mind =
            actor === undefined
                ? new CharacterMemory(state.config.actorId)
                : memoryForCharacter(actor)
        state.memory = ''
        state.conversations.clear()
        state.facts = []
    }
    if (!npcAiActorAvailable(actor)) {
        sessions.cancel(state, now)
        state.awaitingFreshRequest = true
        return undefined
    }
    cancelDepartedConversation(room, sessions, state, now)
    if (
        state.task?.requesterId != null &&
        !requesterAvailable(room.getCharacter(state.task.requesterId))
    ) {
        sessions.cancel(state, now)
    }
    if (leaseExpired(companions, state, actor, now)) {
        sessions.cancel(state, now)
    }
    if (idleLease(state)) {
        sessions.release(state, now)
    }
    state.controlRevision = companions.controlRevision(actor)
    return actor
}

function cancelDepartedConversation(
    room: GameRoom,
    sessions: NpcAiSessionActions,
    state: NpcAiActorState,
    now: number
): void {
    const speakerId = state.dialogue?.senderId
    if (
        speakerId !== undefined &&
        !requesterAvailable(room.getCharacter(speakerId))
    ) {
        if (state.guide?.decision.type === 'travel_to') {
            sessions.cancelInference(state, now)
            stopNpcSelfTravelEscort(state.guide, speakerId)
        } else {
            sessions.cancel(state, now)
        }
    }
}

export function cancelPausedNpcConversation(
    room: GameRoom,
    sessions: NpcAiSessionActions,
    state: NpcAiActorState,
    now: number
): void {
    const { actor, dialogue } = state
    if (
        actor !== undefined &&
        dialogue !== undefined &&
        (room.getCharacter(dialogue.senderId)?.connected !== true ||
            !room.social.npcSpeech.turns.available(actor, dialogue, now))
    ) {
        sessions.cancelInference(state, now)
    }
}

export function cancelNpcActorSession(
    room: GameRoom,
    sessions: NpcAiSessionActions,
    state: NpcAiActorState,
    now: number
): void {
    for (const event of [state.dialogue, ...state.inbox]) {
        if (event !== undefined) {
            room.social.npcSpeech.fail(event, now)
        }
    }
    sessions.cancel(state, now)
}

export function hasNpcControllerLease(
    companions: CompanionService,
    state: NpcAiActorState | undefined,
    now: number
): boolean {
    return (
        state?.actor !== undefined &&
        state.token !== undefined &&
        state.config.mode !== 'dialogue_only' &&
        companions.isModelControlOwner(state.actor, state.token, now)
    )
}

export function archiveNpcAiPerson(
    sessions: NpcAiSessionActions,
    state: NpcAiActorState,
    id: string,
    now: number
): void {
    const inbox = state.inbox.filter((event) => event.senderId !== id)
    if (
        state.dialogue?.senderId === id ||
        state.task?.requesterId === id ||
        state.task?.targetId === id
    ) {
        if (state.guide?.decision.type === 'travel_to') {
            sessions.cancelInference(state, now)
        } else {
            sessions.cancel(state, now)
        }
    }
    stopNpcSelfTravelEscort(state.guide, id)
    state.inbox = inbox
}

function requesterAvailable(actor: GameCharacter | undefined): boolean {
    return (
        actor !== undefined &&
        actor.alive &&
        !actor.tags.has('offline') &&
        !actor.tags.has('state.retired') &&
        (actor.controllerKind !== 'network_player' || actor.connected)
    )
}

function idleLease(state: NpcAiActorState): boolean {
    return (
        state.token !== undefined &&
        state.task === null &&
        state.dialogue === undefined &&
        state.controller === undefined &&
        state.inbox.length === 0
    )
}

function leaseExpired(
    companions: CompanionService,
    state: NpcAiActorState,
    actor: GameCharacter,
    now: number
): boolean {
    return (
        isNpcTurnLeased(state) &&
        state.token !== undefined &&
        !companions.renewModelControl(actor, state.token, now)
    )
}
