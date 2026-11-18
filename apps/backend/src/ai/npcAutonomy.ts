import type { GameCharacter } from '../game/character'
import { snapshotControl } from '../game/characterControl'
import type { GameRoom } from '../game/room'
import {
    enqueueNpcAiEvent,
    npcAiActorAvailable,
    type NpcAiActorState,
} from './runtimeState'

export const NPC_IDLE_ACTIVITY_INTERVAL_MS = 300_000

export function npcSociallyFree(
    room: GameRoom,
    state: NpcAiActorState,
    now: number
): boolean {
    const actor = state.actor
    if (
        !npcAiActorAvailable(actor) ||
        !actor.soul.canSpeak ||
        state.config.mode === 'dialogue_only'
    ) {
        return false
    }
    return (
        !hasAiWork(state) &&
        companionIsFree(actor) &&
        physicallyFree(room, actor, now) &&
        exchangeIsFree(room, actor.id)
    )
}

function hasAiWork(state: NpcAiActorState): boolean {
    return (
        state.task !== null ||
        state.pending !== undefined ||
        state.guide !== undefined ||
        state.dialogue !== undefined ||
        state.inbox.length > 0 ||
        state.controller !== undefined ||
        state.ready !== undefined ||
        state.finalizing !== undefined
    )
}

function companionIsFree(actor: GameCharacter): boolean {
    const companion = actor.soul.companion
    return (
        companion?.leaderId == null &&
        (companion == null || companion.order === 'idle')
    )
}

function physicallyFree(
    room: GameRoom,
    actor: GameCharacter,
    now: number
): boolean {
    return (
        !room.scenarios.busy(actor.id) &&
        !actor.hasPath() &&
        snapshotControl(actor).mode === 'none' &&
        actor.abilities.casting === null &&
        !actor.isActionLocked(now)
    )
}

function exchangeIsFree(room: GameRoom, actorId: string): boolean {
    const exchange = room.social.exchanges.snapshot(actorId)
    return exchange?.status !== 'invited' && exchange?.status !== 'active'
}

export function reviewNpcIdleActivity(
    room: GameRoom,
    state: NpcAiActorState,
    now: number,
    nextId: (kind: string) => string
): void {
    const actor = state.actor
    if (actor === undefined) {
        return
    }
    if (
        !npcSociallyFree(room, state, now) ||
        !room.hasConnectedPlayerInLocation(actor.locationId)
    ) {
        state.idleSince = undefined
        return
    }
    state.idleSince ??= now
    if (
        now - state.idleSince < NPC_IDLE_ACTIVITY_INTERVAL_MS ||
        state.nextAt > now
    ) {
        return
    }
    state.idleSince = undefined
    state.awaitingFreshRequest = false
    state.memory = state.conversations.get('self') ?? ''
    state.task = {
        id: nextId('self'),
        requesterId: null,
        background: 'self_activity',
        deadline: now + 120_000,
        request:
            'Свободное время: выбери одно небольшое мирное занятие в текущей локации по тому, что тебе действительно известно и видно. Учитывай свои обязанности, характер и известные увлечения. Можно исследовать окрестности, заглянуть к знакомому ориентиру или отдохнуть. Используй обычные доступные команды, не начинай чужое поручение и не повторяй объявления. Заверши короткое занятие.',
        steps: 0,
    }
    enqueueNpcAiEvent(state, {
        kind: 'world',
        id: nextId('idle'),
        reason: 'idle_activity',
        at: now,
    })
}

export function npcSelfActivityInterrupted(
    room: GameRoom,
    state: NpcAiActorState,
    now: number
): boolean {
    const task = state.task
    const actor = state.actor
    return (
        task?.background === 'self_activity' &&
        (actor === undefined ||
            !room.hasConnectedPlayerInLocation(actor.locationId) ||
            state.inbox.length > 0 ||
            now >= (task.deadline ?? Infinity) ||
            (task.steps >= 3 &&
                state.pending === undefined &&
                state.controller === undefined &&
                state.ready === undefined &&
                state.finalizing === undefined))
    )
}
