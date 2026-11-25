import type { AdventureClientMessage } from '@my-game-ratata/contracts'

import type { AdventureActionResult } from './adventureTrading'
import { agentSpeech } from './agentSpeech'
import type { GameCharacter } from './character'
import type { GameRoom } from './room'
import { canPerformSkillAction } from './skillProgression'
import { recordWorkerActivity, recordWorkerResult } from './workerActivityState'
import { parkWorkerAtClerk } from './workerClerkParking'
import { approach, stop } from './workerNavigation'
import { recordWorkerIncidentActivity } from './workerRequestActivity'
import { WORKER_REQUEST_RADIUS, type WorkerIncident } from './workerRequestData'

export type AuthorizedWorkerCommand = (
    actor: GameCharacter,
    message: AdventureClientMessage,
    room: GameRoom,
    now: number
) => AdventureActionResult

export function advanceWorkerIncident(
    incident: WorkerIncident,
    actor: GameCharacter,
    room: GameRoom,
    now: number,
    perform: AuthorizedWorkerCommand
): void {
    if (!canPerformSkillAction(actor, now)) {
        recordWorkerActivity(
            actor,
            {
                reason: 'unavailable',
                text: 'Работа временно недоступна из-за состояния персонажа.',
                intent: 'wait',
                worksite: incident.target,
                requestId: incident.view.id,
                stage: incident.view.stage,
            },
            now
        )
        return
    }
    delete incident.activityReason
    delete incident.activityIntent
    delete incident.activityUntil
    advanceIncident(incident, actor, room, now, perform)
    recordWorkerIncidentActivity(actor, incident, now)
}

function advanceIncident(
    incident: WorkerIncident,
    actor: GameCharacter,
    room: GameRoom,
    now: number,
    perform: AuthorizedWorkerCommand
): void {
    if (
        incident.view.stage === 'outbound' ||
        incident.view.stage === 'working'
    ) {
        advanceTrial(incident, actor, room, now, perform)
        return
    }
    if (
        incident.view.stage === 'reporting' ||
        incident.view.stage === 'returning'
    ) {
        if (
            incident.returnReady &&
            room.findVisibleTarget(actor, WORKER_REQUEST_RADIUS, now) !==
                undefined
        ) {
            incident.returnReady = false
            incident.trialPoint = null
            incident.view.reason =
                'Опасность осталась: работник возвращается за помощью.'
        }
        returnToClerk(incident, actor, room, now)
        return
    }
    if (incident.view.stage === 'waiting' || incident.view.stage === 'ready') {
        returnToClerk(incident, actor, room, now)
    } else {
        stop(actor)
    }
}

function advanceTrial(
    incident: WorkerIncident,
    actor: GameCharacter,
    room: GameRoom,
    now: number,
    perform: AuthorizedWorkerCommand
): void {
    if (
        room.findVisibleTarget(actor, WORKER_REQUEST_RADIUS, now) !== undefined
    ) {
        incident.threatObservedAt = now
        incident.activityReason = 'threat'
        incident.view.stage = 'returning'
        incident.view.reason =
            'Опасность осталась: работник возвращается за помощью.'
        incident.returnReady = false
        incident.trialPoint = null
        returnToClerk(incident, actor, room, now)
        return
    }
    const target = incident.target
    incident.view.reason = null
    if (actor.locationId !== target.locationId) {
        approach(actor, room, target.locationId, target.position)
        incident.view.reason = hasRoute(actor)
            ? null
            : 'К рабочему участку нет доступного пути.'
        return
    }
    incident.view.stage = 'working'
    const result = incident.adapter.advance(
        actor,
        room,
        target,
        now,
        (message) => {
            const result = perform(actor, message, room, now)
            recordWorkerResult(actor, message.type, result, now)
            return result
        }
    )
    incident.view.reason = result.reason
    if (result.block !== undefined) {
        incident.activityReason = result.block
    }
    if (result.until !== undefined) {
        incident.activityUntil = result.until
    }
    if (result.done) {
        incident.trialPoint = {
            locationId: actor.locationId,
            position: { ...actor.position },
        }
        incident.returnReady = true
        incident.view.stage = 'returning'
    }
}

function returnToClerk(
    incident: WorkerIncident,
    actor: GameCharacter,
    room: GameRoom,
    now: number
): void {
    const clerk = room.getCharacter(incident.clerkId)
    if (clerk?.alive !== true || clerk.tags.has('state.retired')) {
        stop(actor)
        incident.activityReason = 'supplier'
        incident.view.reason = 'Распорядитель сейчас недоступен.'
        return
    }
    const outcome = parkWorkerAtClerk(actor, clerk, room, now)
    if (outcome !== 'arrived') {
        if (outcome === 'blocked') {
            incident.activityReason = 'route'
            incident.view.reason =
                'Жду доступного отдельного места у распорядителя; путь будет перепроверен.'
        } else {
            incident.activityIntent =
                incident.view.stage === 'reporting' ? 'report' : 'return'
            incident.view.reason =
                incident.view.stage === 'ready'
                    ? 'Рабочая проверка сохранена. Иду к новой позиции распорядителя для сдачи.'
                    : 'Иду к отдельному месту ожидания у живого распорядителя.'
        }
        return
    }
    if (incident.view.stage === 'waiting' || incident.view.stage === 'ready') {
        incident.view.reason = null
        return
    }
    publishWorkerReport(incident, actor, clerk, room, now)
}

function publishWorkerReport(
    incident: WorkerIncident,
    actor: GameCharacter,
    clerk: GameCharacter,
    room: GameRoom,
    now: number
): void {
    const firstReport = incident.view.stage === 'reporting'
    incident.published = true
    incident.view.stage = incident.returnReady ? 'ready' : 'waiting'
    if (incident.returnReady) {
        incident.view.reason = null
    }
    if (firstReport || incident.returnReady) {
        const report = agentSpeech(
            actor,
            {
                type: 'speak',
                targetId: clerk.id,
                text: firstReport
                    ? 'На моём рабочем участке замечена опасность. Прошу помощи.'
                    : 'Я вернулся с участка. Рабочая проверка прошла успешно, награду можно выдать после сдачи.',
            },
            room,
            now
        )
        room.publishEvents(report.events)
    }
}

function hasRoute(actor: GameCharacter): boolean {
    const input = actor.getMoveInput()
    return actor.hasPath() || input.x !== 0 || input.y !== 0
}
