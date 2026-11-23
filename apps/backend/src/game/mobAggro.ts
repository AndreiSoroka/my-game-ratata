import {
    type CharacterFactionId,
    type Vector2,
    WILDERNESS_AGGRO_POLICY,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { canTargetByFaction } from './factions'
import { distance } from './math'
import type { GameRoom } from './room'

interface ThreatReport {
    faction: CharacterFactionId
    locationId: string
    origin: Vector2
    reportedAt: number
    targetId: string
    targetPosition: Vector2
}

const policy = WILDERNESS_AGGRO_POLICY
const reportsByRoom = new WeakMap<GameRoom, Map<string, ThreatReport>>()

export function coordinatedTarget(
    actor: GameCharacter,
    room: GameRoom,
    now: number
): GameCharacter | undefined {
    if (!isActiveObserver(actor)) {
        return undefined
    }
    const reports = reportsFor(room, now)
    const visible = room.findVisibleTarget(actor, policy.sightRadius, now)
    if (validTarget(actor, visible, policy.sightRadius, now)) {
        const previous = reports.get(actor.id)
        if (
            previous === undefined ||
            now - previous.reportedAt >= policy.alertCooldownMs
        ) {
            reports.set(actor.id, {
                faction: actor.faction,
                locationId: actor.locationId,
                origin: { ...actor.position },
                reportedAt: now,
                targetId: visible.id,
                targetPosition: { ...visible.position },
            })
        }
        return visible
    }
    return undefined
}

export function reportedThreatPosition(
    actor: GameCharacter,
    room: GameRoom,
    now: number
): Vector2 | undefined {
    if (!isActiveObserver(actor)) {
        return undefined
    }
    for (const report of reportsFor(room, now).values()) {
        if (
            report.locationId !== actor.locationId ||
            report.faction !== actor.faction ||
            distance(actor.position, report.origin) > policy.alertRadius
        ) {
            continue
        }
        const target = room.getCharacter(report.targetId)
        if (
            target !== undefined &&
            isActiveObserver(target) &&
            target.locationId === actor.locationId &&
            canTargetByFaction(actor, target, now) &&
            distance(actor.position, report.targetPosition) <=
                policy.pursuitRadius &&
            distance(actor.spawnPosition, report.targetPosition) <=
                policy.spawnLeashRadius
        ) {
            return { ...report.targetPosition }
        }
    }
    return undefined
}

function reportsFor(room: GameRoom, now: number): Map<string, ThreatReport> {
    const reports = reportsByRoom.get(room) ?? new Map<string, ThreatReport>()
    reportsByRoom.set(room, reports)
    for (const [id, report] of reports) {
        if (now - report.reportedAt >= policy.alertDurationMs) {
            reports.delete(id)
        }
    }
    return reports
}

function validTarget(
    actor: GameCharacter,
    target: GameCharacter | undefined,
    radius: number,
    now: number
): target is GameCharacter {
    // The home leash bounds investigation of reports, not combat with a visible opponent.
    // Applying it here leaves a monster harmless at point-blank range after a chase.
    return (
        target !== undefined &&
        target.alive &&
        !target.tags.has('offline') &&
        target.locationId === actor.locationId &&
        canTargetByFaction(actor, target, now) &&
        distance(actor.position, target.position) <= radius
    )
}

export function isActiveObserver(character: GameCharacter): boolean {
    return character.alive && !character.tags.has('offline')
}
