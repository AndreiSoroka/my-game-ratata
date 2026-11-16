import type { AdventureClientMessage } from '@my-game-ratata/contracts'

import type { AdventureActionResult } from './adventureTrading'
import type { GameCharacter } from './character'
import type { GameRoom } from './room'
import { canPerformSkillAction } from './skillProgression'
import { approach, stop } from './workerNavigation'
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
        return
    }
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
        returnToClerk(incident, actor, room)
        return
    }
    stop(actor)
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
        incident.view.stage = 'returning'
        incident.view.reason =
            'Опасность осталась: работник возвращается за помощью.'
        incident.returnReady = false
        incident.trialPoint = null
        returnToClerk(incident, actor, room)
        return
    }
    const target = incident.target
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
        (message) => perform(actor, message, room, now)
    )
    incident.view.reason = result.reason
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
    room: GameRoom
): void {
    const clerk = room.getCharacter(incident.clerkId)
    if (clerk?.alive !== true || clerk.tags.has('state.retired')) {
        stop(actor)
        incident.view.reason = 'Распорядитель сейчас недоступен.'
        return
    }
    if (!approach(actor, room, clerk.locationId, clerk.position)) {
        if (!hasRoute(actor)) {
            incident.view.reason = 'К распорядителю нет доступного пути.'
        }
        return
    }
    incident.published = true
    incident.view.stage = incident.returnReady ? 'ready' : 'waiting'
    if (incident.returnReady) {
        incident.view.reason = null
    }
}

function hasRoute(actor: GameCharacter): boolean {
    const input = actor.getMoveInput()
    return actor.hasPath() || input.x !== 0 || input.y !== 0
}
