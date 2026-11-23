import type { GameEventPayload } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import {
    isReportGuard,
    type JusticeContext,
    nearbyReportGuard,
    reachableCityGuard,
    reportPosition,
} from './cityJustice'
import type { CrimeOffense } from './crimeEvidence'
import { distance } from './math'
import type { GameRoom } from './room'
import { canPerformSkillAction } from './skillProgression'

export interface ReportResponse {
    mode: 'report'
    offenderId: string
    guardId: string
    offense: CrimeOffense
    locationId: string
    until: number
    lastPlanAt: number
}
export type Report = (
    actor: GameCharacter,
    targetId: string,
    context: JusticeContext,
    offense: CrimeOffense
) => GameEventPayload[]

export function planNpcCrimeReport(
    actor: GameCharacter,
    offenderId: string,
    until: number | undefined,
    context: JusticeContext
) {
    if (until === undefined || until <= context.now) {
        return undefined
    }
    const guard = reachableCityGuard(actor, offenderId, context)
    return guard === undefined ? undefined : { until, guard }
}

export function advanceNpcCrimeReport(
    room: GameRoom,
    actor: GameCharacter,
    response: ReportResponse,
    all: ReadonlyMap<string, GameCharacter>,
    now: number,
    report: Report
): boolean {
    const offender = all.get(response.offenderId)
    if (
        actor.locationId !== response.locationId ||
        offender === undefined ||
        offender.tags.has('state.retired')
    ) {
        return false
    }
    const context = {
        adventure: room.adventureForWorkers(),
        characters: [...all.values()],
        navigation: room.navigationFor(actor),
        now,
    }
    if (
        context.characters.some((guard) =>
            nearbyReportGuard(actor, guard, response.offenderId, context)
        )
    ) {
        if (!canPerformSkillAction(actor, now)) {
            return true
        }
        room.publishEvents(
            report(actor, response.offenderId, context, response.offense)
        )
        return false
    }
    const selected = all.get(response.guardId)
    const guard = isReportGuard(actor, selected, response.offenderId)
        ? selected
        : reachableCityGuard(actor, response.offenderId, context)
    if (guard === undefined) {
        return false
    }
    response.guardId = guard.id
    if (actor.hasPath() && now - response.lastPlanAt < 500) {
        return true
    }
    const destination = reportPosition(actor, guard, context)
    const path = context.navigation.findPathWorld(actor.position, destination)
    if (distance(actor.position, destination) <= 1 || path.length === 0) {
        return false
    }
    actor.setPath(path)
    response.lastPlanAt = now
    return true
}
