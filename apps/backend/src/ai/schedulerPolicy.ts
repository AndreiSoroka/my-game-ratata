import type { GameCharacter } from '../game/character'
import { distance } from '../game/math'
import { NPC_OBSERVATION_RADIUS } from '../game/queries'
import type { GameRoom } from '../game/room'
import { npcCombatReactionStillAvailable } from './combatReactions'
import { npcAiActorAvailable, type NpcAiActorState } from './runtimeState'
import { savvaPersuasionOffer } from './savvaDialogue'
import type { NpcAiEvent } from './types'

export function prioritizeNpcAiStates(
    a: NpcAiActorState,
    b: NpcAiActorState
): number {
    const priority = turnPriority(b) - turnPriority(a)
    const first = a.inbox[0]
    const second = b.inbox[0]
    return priority === 0 && first !== undefined && second !== undefined
        ? first.at - second.at
        : priority
}

function turnPriority(state: NpcAiActorState): number {
    return state.inbox.length > 0 ? 2 : Number(state.task?.requesterId != null)
}

export function continuationAvailable(
    room: GameRoom,
    state: NpcAiActorState,
    now: number
): boolean {
    return (
        state.task !== null &&
        state.events.length > 0 &&
        state.guide === undefined &&
        state.pending === undefined &&
        state.attack === undefined &&
        (state.task.background !== 'combat_reaction' ||
            npcCombatReactionStillAvailable(room, state, now)) &&
        !room.social.exchanges.isPaused(state.config.actorId)
    )
}

export function isBackgroundNpcTurn(state: NpcAiActorState): boolean {
    return state.dialogue === undefined && state.task?.requesterId == null
}

export function npcNearPlayer(room: GameRoom, actor: GameCharacter): boolean {
    return room
        .charactersFor(actor)
        .some(
            (other) =>
                other.controllerKind === 'network_player' &&
                other.connected &&
                other.alive &&
                distance(actor.position, other.position) <=
                    NPC_OBSERVATION_RADIUS
        )
}

export function npcAiMessageAvailable(
    room: GameRoom,
    actor: GameCharacter,
    event: Extract<NpcAiEvent, { kind: 'message' }>,
    now: number
): boolean {
    return (
        room.getCharacter(event.senderId)?.connected === true &&
        room.social.npcSpeech.turns.available(actor, event, now)
    )
}

export function prepareNpcAiTurns(
    room: GameRoom,
    states: Iterable<NpcAiActorState>,
    now: number,
    scarce = false
): NpcAiActorState[] {
    const candidates: NpcAiActorState[] = []
    const wall = room.realNow()
    for (const state of states) {
        const actor = state.actor
        if (!npcAiActorAvailable(actor)) {
            continue
        }
        state.inbox = state.inbox.filter((event) =>
            npcAiMessageAvailable(room, actor, event, now)
        )
        if (
            room.social.society.conflicts?.hasPhysicalReaction(actor, now) ===
                true &&
            !prioritizePersuasion(room, state, actor, now)
        ) {
            continue
        }
        const continuation = canContinue(room, state, actor, now, wall, scarce)
        if (runnableTurn(state, now, continuation)) {
            candidates.push(state)
        }
    }
    return candidates.sort(prioritizeNpcAiStates)
}

function canContinue(
    room: GameRoom,
    state: NpcAiActorState,
    actor: GameCharacter,
    now: number,
    wall: number,
    scarce: boolean
): boolean {
    return (
        room.allowsAutonomousNpcAi() &&
        (state.budgetUntil ?? 0) <= wall &&
        continuationAvailable(room, state, now) &&
        (!scarce ||
            state.task?.requesterId != null ||
            state.task?.background === 'combat_reaction' ||
            npcNearPlayer(room, actor))
    )
}

function prioritizePersuasion(
    room: GameRoom,
    state: NpcAiActorState,
    actor: GameCharacter,
    now: number
): boolean {
    const next = state.inbox.findIndex(
        (event) => savvaPersuasionOffer(room, actor, event, now) !== undefined
    )
    if (next > 0) {
        state.inbox.unshift(...state.inbox.splice(next, 1))
    }
    return next !== -1
}

function runnableTurn(
    state: NpcAiActorState,
    now: number,
    continuation: boolean
): boolean {
    return (
        (continuation || state.inbox.length > 0) &&
        state.ready === undefined &&
        state.controller === undefined &&
        state.nextAt <= now &&
        !state.awaitingFreshRequest
    )
}
