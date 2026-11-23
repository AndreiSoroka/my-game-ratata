import {
    type GameEventPayload,
    THEFT_RULES,
    type Vector2,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { visibilityRadius } from './characterSight'
import { grantRetaliation } from './crimeRelations'
import { combatFaction } from './factions'
import { visibleBuildingPoint } from './mapBuildings'
import { distance } from './math'
import type { NavigationService } from './navigation'
import type { GameRoom } from './room'
import type { TheftService } from './theft'

export type CombatContactObserver = (
    attacker: GameCharacter,
    victim: GameCharacter,
    now: number
) => void

export function recordCivicAssault(
    theft: TheftService,
    attacker: GameCharacter,
    victim: GameCharacter,
    now: number
): void {
    if (
        combatFaction(attacker) === 'peaceful' &&
        combatFaction(victim) === 'peaceful'
    ) {
        grantRetaliation(victim, attacker, now + THEFT_RULES.retaliationMs)
        theft.recordAssault(attacker, victim, now)
    }
}

export function publicCombatHit(room: GameRoom, event: GameEventPayload) {
    if (!isPublicDamage(event)) {
        return undefined
    }
    const attacker = room.getCharacter(event.actorId ?? '')
    const target = room.getCharacter(event.targetId ?? '')
    if (
        attacker === undefined ||
        attacker.locationId !== target?.locationId ||
        (event.locationId ?? target.locationId) !== target.locationId ||
        attacker.trainingTarget !== undefined ||
        target.trainingTarget !== undefined
    ) {
        return undefined
    }
    return {
        id: event.eventId,
        attacker,
        target,
        amount: event.amount,
        impact: { ...(event.position ?? target.position) },
    }
}

function isPublicDamage(
    event: GameEventPayload
): event is GameEventPayload & { eventId: string; amount: number } {
    return (
        event.kind === 'damage' &&
        event.audienceIds === undefined &&
        event.eventId !== undefined &&
        event.eventId !== '' &&
        event.amount !== undefined &&
        Number.isFinite(event.amount) &&
        event.amount > 0
    )
}

export function canWitnessCombatant(
    observer: GameCharacter,
    subject: GameCharacter,
    navigation: NavigationService,
    radius: number,
    now: number
): boolean {
    return (
        observer.locationId === subject.locationId &&
        canWitnessPoint(
            observer,
            subject.position,
            navigation,
            visibilityRadius(observer, subject, radius, now)
        )
    )
}

export function canWitnessPoint(
    observer: GameCharacter,
    point: Vector2,
    navigation: NavigationService,
    radius: number
): boolean {
    const buildings = navigation.grid.buildings ?? []
    return (
        distance(observer.position, point) <= radius &&
        navigation.hasLineOfSight(observer.position, point) &&
        visibleBuildingPoint(buildings, observer.position, point) &&
        visibleBuildingPoint(buildings, point, observer.position)
    )
}
