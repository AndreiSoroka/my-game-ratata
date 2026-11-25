import type { GameCharacter } from './character'
import {
    openIncident,
    WORKER_REQUEST_ORPHAN_MS,
    type WorkerIncident,
} from './workerRequestData'

export function releaseWorkerClaim(incident: WorkerIncident): void {
    incident.claim = null
    incident.returnReady = false
    incident.trialPoint = null
    delete incident.seedVisit
    if (['outbound', 'working', 'returning'].includes(incident.view.stage)) {
        incident.view.stage = 'returning'
    } else if (openIncident(incident)) {
        incident.view.stage = 'waiting'
    }
    incident.view.reason = 'Обращение снова доступно для принятия.'
}

export function completeWorkerRequest(
    incident: WorkerIncident | undefined,
    payment: () => boolean
): boolean {
    if (incident?.view.stage !== 'ready' || !payment()) {
        return false
    }
    incident.view.stage = 'completed'
    incident.view.reason = null
    incident.claim = null
    return true
}

export function reconcileWorkerIncident(
    incident: WorkerIncident,
    characters: ReadonlyMap<string, GameCharacter>,
    now: number
): void {
    if (!openIncident(incident)) {
        return
    }
    const worker = characters.get(incident.view.workerId)
    if (worker === undefined || worker.tags.has('state.retired')) {
        incident.view.stage = 'cancelled'
        incident.view.reason =
            'Работник окончательно погиб; обращение отменено.'
        incident.claim = null
        return
    }
    if (!worker.alive) {
        incident.view.reason = 'Работник погиб и ожидает воскрешения.'
    } else if (
        incident.view.reason === 'Работник погиб и ожидает воскрешения.'
    ) {
        incident.view.reason = null
    }
    reconcileClaim(incident, characters, now)
}

function claimedBy(incident: WorkerIncident, groupKey: string): boolean {
    return incident.claim?.key === groupKey
}

/** Explicit cancellation must not alter other groups' orphan deadlines. */
export function releaseWorkerGroup(
    incidents: Iterable<WorkerIncident>,
    characters: ReadonlyMap<string, GameCharacter>,
    groupKey: string,
    now: number
): void {
    for (const incident of incidents) {
        if (!claimedBy(incident, groupKey)) {
            continue
        }
        reconcileWorkerIncident(incident, characters, now)
        if (claimedBy(incident, groupKey)) {
            releaseWorkerClaim(incident)
        }
    }
}

function reconcileClaim(
    incident: WorkerIncident,
    characters: ReadonlyMap<string, GameCharacter>,
    now: number
): void {
    const claim = incident.claim
    if (claim === null) {
        return
    }
    const online = [...claim.members].some((id) => {
        const member = characters.get(id)
        return (
            member?.connected === true &&
            !member.tags.has('offline') &&
            !member.tags.has('state.retired')
        )
    })
    if (online) {
        claim.lastOnlineAt = now
    } else if (now - claim.lastOnlineAt >= WORKER_REQUEST_ORPHAN_MS) {
        releaseWorkerClaim(incident)
    }
}
