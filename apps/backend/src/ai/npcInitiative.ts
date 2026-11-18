import type { GameCharacter } from '../game/character'
import type { GameRoom } from '../game/room'
import { canHearSpeech, speechAvailable } from '../game/socialSpeech'
import type { CharacterMemory } from './characterMemory'
import { buildNpcAiObservation } from './observation'
import type { NpcAiObservation } from './observationTypes'
import { npcAiActorAvailable, type NpcAiActorState } from './runtimeState'

export const NPC_CONVERSATION_PAUSE_MS = 10 * 60_000
export const NPC_GREETING_ATTEMPT_DELAY_MS = 60_000

export interface NpcGreetingOpportunity {
    kind: 'greeting'
    targetId: string
    reason: 'first_conversation' | 'conversation_pause'
    lastConversationAt?: number
}

const nextAttempts = new WeakMap<CharacterMemory, number>()

export function greetingOpportunity(
    memory: CharacterMemory,
    targetId: string,
    now: number
): NpcGreetingOpportunity | undefined {
    if (memory.isArchived(targetId)) {
        return undefined
    }
    const lastConversationAt = memory.lastConversationAt(targetId)
    if (lastConversationAt === undefined) {
        return { kind: 'greeting', targetId, reason: 'first_conversation' }
    }
    return now - lastConversationAt < NPC_CONVERSATION_PAUSE_MS
        ? undefined
        : {
              kind: 'greeting',
              targetId,
              reason: 'conversation_pause',
              lastConversationAt,
          }
}

export function markNpcGreetingAttempt(
    state: NpcAiActorState,
    _targetId: string,
    now: number
): void {
    nextAttempts.set(state.mind, now + NPC_GREETING_ATTEMPT_DELAY_MS)
}

/** Called only for enabled AI states. It never creates a player utterance or accepts work. */
export function selectNpcGreeting(
    room: GameRoom,
    state: NpcAiActorState,
    observation: NpcAiObservation,
    now: number
): NpcGreetingOpportunity | undefined {
    if (!greetingStateIdle(state)) {
        return undefined
    }
    if ((nextAttempts.get(state.mind) ?? 0) > now) {
        return undefined
    }
    for (const target of observation.targets
        .filter((entry) => entry.kind === 'character')
        .sort((a, b) =>
            a.distance === b.distance
                ? a.id.localeCompare(b.id)
                : a.distance - b.distance
        )) {
        const opportunity = greetingOpportunity(state.mind, target.id, now)
        if (
            opportunity !== undefined &&
            availableGreetingPair(
                room,
                state,
                room.getCharacter(target.id),
                now
            )
        ) {
            return opportunity
        }
    }
    return undefined
}

function greetingStateIdle(state: NpcAiActorState): boolean {
    return (
        state.task === null &&
        state.dialogue === undefined &&
        state.inbox.length === 0 &&
        state.pending === undefined &&
        state.guide === undefined &&
        state.controller === undefined &&
        state.ready === undefined &&
        state.finalizing === undefined
    )
}

export function npcGreetingStillAvailable(
    room: GameRoom,
    state: NpcAiActorState,
    targetId: string,
    now: number
): boolean {
    if (
        state.dialogue !== undefined ||
        state.inbox.length > 0 ||
        (state.task !== null &&
            (state.task.background !== 'greeting' ||
                state.task.targetId !== targetId)) ||
        greetingOpportunity(state.mind, targetId, now) === undefined ||
        !availableGreetingPair(room, state, room.getCharacter(targetId), now) ||
        state.actor === undefined
    ) {
        return false
    }
    return buildNpcAiObservation(
        room,
        state.actor,
        state.config.role,
        now
    ).targets.some(
        (target) => target.kind === 'character' && target.id === targetId
    )
}

function availableGreetingPair(
    room: GameRoom,
    state: NpcAiActorState,
    target: GameCharacter | undefined,
    now: number
): boolean {
    const actor = state.actor
    return (
        npcAiActorAvailable(actor) &&
        npcCanSociallySpeak(room, actor, now) &&
        target?.controllerKind === 'network_player' &&
        target.connected &&
        speechAvailable(target) &&
        (actor.soul.companion?.leaderId == null ||
            actor.soul.companion.leaderId === target.id) &&
        canHearSpeech(target, actor, room.navigationFor(actor), now)
    )
}

function npcCanSociallySpeak(
    room: GameRoom,
    actor: GameCharacter,
    now: number
): boolean {
    const exchange = room.social.exchanges.snapshot(actor.id)
    return (
        actor.soul.canSpeak &&
        !room.scenarios.busy(actor.id) &&
        actor.abilities.casting === null &&
        !actor.isActionLocked(now) &&
        exchange?.status !== 'invited' &&
        exchange?.status !== 'active'
    )
}
