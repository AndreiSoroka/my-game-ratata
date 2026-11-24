import {
    authoredMessage,
    authoredRussian,
    type GameEventPayload,
    trainingAreaAt,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { canObserveRoomCharacter, usesStealthSight } from './characterSight'
import type { CombatObserver } from './combatObservation'
import { visibilityRadius } from './queries'

/** This projection never mutates the numeric domain event used by simulation services. */
export function observeCombatEvent(
    event: GameEventPayload,
    view: CombatObserver
): GameEventPayload | undefined {
    const { audienceIds, amount, ...description } = event
    const observerId = view.observer?.id
    if (
        audienceIds !== undefined &&
        (observerId === undefined || !audienceIds.includes(observerId))
    ) {
        return undefined
    }
    if (!eventCharacterVisible(event.targetId, view)) {
        return undefined
    }
    const visible = {
        ...description,
        ...(amount !== undefined && amountVisible(event, view)
            ? { amount }
            : {}),
    }
    if (visible.kind === 'damage') {
        delete visible.eventId
    }
    return projectObservedDetails(event, visible, view)
}

function projectObservedDetails(
    source: GameEventPayload,
    visible: GameEventPayload,
    view: CombatObserver
): GameEventPayload | undefined {
    if (!eventActorVisible(source, view)) {
        const speaker =
            source.kind === 'chat'
                ? view.getCharacter(source.actorId ?? '')
                : undefined
        if (speaker !== undefined && usesStealthSight(speaker, view.now)) {
            return undefined
        }
        redactActor(visible, source.audienceIds !== undefined)
    }
    if (
        visible.kind === 'water_drink' &&
        view.observer?.exactCombatNumbers !== true
    ) {
        visible.text = authoredRussian('world.drinkObserved')
        visible.textMessage = authoredMessage('world.drinkObserved')
    }
    return visible
}

function redactActor(event: GameEventPayload, privateText: boolean): void {
    delete event.actorId
    delete event.actionId
    delete event.attackGeometry
    delete event.castMode
    delete event.position
    delete event.projectile
    delete event.speakerName
    delete event.speechId
    delete event.voice
    delete event.language
    if (!privateText && event.kind !== 'chat') {
        delete event.text
        delete event.textMessage
    }
}

function eventActorVisible(
    event: GameEventPayload,
    view: CombatObserver
): boolean {
    const { actorId, locationId } = event
    if (
        actorId !== undefined &&
        locationId !== undefined &&
        view.getCharacter(actorId)?.locationId !== locationId
    ) {
        return false
    }
    return eventCharacterVisible(actorId, view)
}

function eventCharacterVisible(
    id: string | undefined,
    view: CombatObserver
): boolean {
    if (id === undefined) {
        return true
    }
    const character = view.getCharacter(id)
    return (
        character === undefined ||
        canObserveRoomCharacter(
            view.observer,
            character,
            view.navigation,
            view.now
        )
    )
}

export function observeCombatEvents(
    events: readonly GameEventPayload[],
    view: CombatObserver
): GameEventPayload[] {
    return events.flatMap((event) => {
        const projected = observeCombatEvent(event, view)
        return projected === undefined ? [] : [projected]
    })
}

function amountVisible(event: GameEventPayload, view: CombatObserver): boolean {
    if (view.observer?.exactCombatNumbers === true) {
        return true
    }
    if (event.kind === 'damage' || event.kind === 'world_damage') {
        return trainingMeasurement(event, view)
    }
    return !(
        ['heal', 'absorb', 'item_eat', 'revive'].includes(event.kind) ||
        (event.kind === 'status' && event.statusId === 'barrier')
    )
}

function trainingMeasurement(
    event: GameEventPayload,
    view: CombatObserver
): boolean {
    const observer = view.observer
    const target =
        event.targetId === undefined
            ? undefined
            : view.getCharacter(event.targetId)
    if (
        !activeObserver(observer, view) ||
        target?.trainingTarget === undefined ||
        target.locationId !== observer.locationId ||
        view.navigation === undefined
    ) {
        return false
    }
    const area = trainingAreaAt(
        view.navigation.grid.training?.areas ?? [],
        observer.locationId,
        observer.position
    )
    return (
        area?.id === target.trainingTarget.areaId &&
        Math.hypot(
            target.position.x - observer.position.x,
            target.position.y - observer.position.y
        ) <= visibilityRadius(observer, target, 240, view.now) &&
        view.navigation.hasLineOfSight(observer.position, target.position)
    )
}
function activeObserver(
    observer: GameCharacter | undefined,
    view: CombatObserver
): observer is GameCharacter {
    return (
        observer !== undefined &&
        observer.alive &&
        (observer.connected ||
            view.hasModelLease?.(observer, view.now) === true) &&
        !observer.tags.has('offline') &&
        !observer.tags.has('state.retired')
    )
}
