import type { GameCharacter } from '../game/character'
import { snapshotControl } from '../game/characterControl'
import { kaplyaSafetyActive } from '../game/companionSafety'
import { isConversationOnly } from '../game/npcRoster'
import type { GameRoom } from '../game/room'
import {
    enqueueNpcAiEvent,
    npcAiActorAvailable,
    type NpcAiActorState,
} from './runtimeState'

export const NPC_IDLE_ACTIVITY_INTERVAL_MS = 300_000
const scenarioReviewDelay = 60_000
const scenarioFailureLimit = 3

interface ScenarioReviewProgress {
    scenarioId: string
    iteration: number
    failures: number
    nextReviewAt: number
}
const scenarioProgress = new WeakMap<GameCharacter, ScenarioReviewProgress>()

export function npcSociallyFree(
    room: GameRoom,
    state: NpcAiActorState,
    now: number
): boolean {
    return canChooseActivity(room, state, now, false)
}

function canChooseActivity(
    room: GameRoom,
    state: NpcAiActorState,
    now: number,
    scenarioReview: boolean
): boolean {
    const actor = state.actor
    if (
        !npcAiActorAvailable(actor) ||
        !actor.soul.canSpeak ||
        isConversationOnly(state.config.role, state.config.mode) ||
        kaplyaSafetyActive(actor)
    ) {
        return false
    }
    return (
        !hasAiWork(state) &&
        companionIsFree(actor) &&
        physicallyFree(room, actor, now, scenarioReview) &&
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
    now: number,
    scenarioReview: boolean
): boolean {
    return (
        (scenarioReview || !room.scenarios.busy(actor.id)) &&
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
    if (!room.allowsAutonomousNpcAi()) {
        state.idleSince = undefined
        return
    }
    if (reviewFailedScenario(room, state, actor, now, nextId)) {
        return
    }
    if (!npcSociallyFree(room, state, now)) {
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

function reviewFailedScenario(
    room: GameRoom,
    state: NpcAiActorState,
    actor: GameCharacter,
    now: number,
    nextId: (kind: string) => string
): boolean {
    if (state.config.role !== 'companion') {
        return false
    }
    const progress = observeScenarioFailure(room, actor)
    if (
        progress === undefined ||
        progress.failures < scenarioFailureLimit ||
        now < progress.nextReviewAt ||
        now < state.nextAt ||
        !canChooseActivity(room, state, now, true)
    ) {
        return false
    }
    progress.failures = 0
    progress.nextReviewAt = now + scenarioReviewDelay
    state.idleSince = undefined
    state.awaitingFreshRequest = false
    state.memory = state.conversations.get('self') ?? ''
    state.task = {
        id: nextId('scenario-review'),
        requesterId: null,
        background: 'scenario_review',
        deadline: now + scenarioReviewDelay,
        request:
            'Твой сценарий несколько раз закончил проход с ошибками. Посмотри текущие результаты в observation.scenarios. Если есть осмысленная правка, настрой свой сценарий заново по известным параметрам; иначе оставь его как есть. Это внутренняя настройка, не поручение и не новое действие с персонажами.',
        steps: 0,
    }
    enqueueNpcAiEvent(state, {
        kind: 'world',
        id: nextId('scenario-review'),
        reason: 'scenario_review',
        at: now,
    })
    return true
}

function observeScenarioFailure(
    room: GameRoom,
    actor: GameCharacter
): ScenarioReviewProgress | undefined {
    const run = room.scenarios.ownRunForReview(actor.id)
    if (
        run?.status !== 'running' ||
        !run.scenarioId.startsWith('npc-template-')
    ) {
        scenarioProgress.delete(actor)
        return undefined
    }
    const previous = scenarioProgress.get(actor)
    const progress =
        previous?.scenarioId === run.scenarioId &&
        previous.iteration <= run.iteration
            ? previous
            : {
                  scenarioId: run.scenarioId,
                  iteration: 0,
                  failures: 0,
                  nextReviewAt: previous?.nextReviewAt ?? 0,
              }
    scenarioProgress.set(actor, progress)
    if (run.phase !== 'between_passes') {
        return undefined
    }
    if (progress.iteration !== run.iteration) {
        progress.iteration = run.iteration
        progress.failures = run.results.some(
            ({ status }) => status === 'failed'
        )
            ? progress.failures + 1
            : 0
    }
    return progress
}

export function npcSelfActivityInterrupted(
    room: GameRoom,
    state: NpcAiActorState,
    now: number
): boolean {
    const task = state.task
    const actor = state.actor
    return (
        task !== null &&
        isOwnBackground(task.background) &&
        (actor === undefined ||
            abandonedBackground(room, state) ||
            state.inbox.length > 0 ||
            now >= (task.deadline ?? Infinity) ||
            (task.steps >= 3 &&
                state.pending === undefined &&
                state.controller === undefined &&
                state.ready === undefined &&
                state.finalizing === undefined))
    )
}

function isOwnBackground(
    background: NonNullable<NpcAiActorState['task']>['background']
): boolean {
    return background === 'self_activity' || background === 'scenario_review'
}

function abandonedBackground(room: GameRoom, state: NpcAiActorState): boolean {
    return (
        !room.allowsAutonomousNpcAi() &&
        state.pending === undefined &&
        state.guide === undefined
    )
}
