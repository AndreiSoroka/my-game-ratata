import {
    getWorldLocationDefinition,
    HOSTILE_TROPHY_ITEMS,
    type WorkerSettlementProfile,
    type WorkerWorkTarget,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { GameRoom } from './room'
import { WORKER_REQUEST_RADIUS, type WorkerIncident } from './workerRequestData'
import type { WorkerWorkAdapter } from './workerRequestWork'

export function createWorkerIncident(
    id: string,
    actor: GameCharacter,
    job: string,
    room: GameRoom,
    now: number,
    profiles: readonly WorkerSettlementProfile[],
    adapters: ReadonlyMap<string, WorkerWorkAdapter>,
    target?: WorkerWorkTarget
): WorkerIncident | undefined {
    if (!actor.alive || actor.tags.has('state.retired')) {
        return undefined
    }
    const adapter = adapters.get(job)
    const threat = room.findVisibleTarget(actor, WORKER_REQUEST_RADIUS, now)
    const trophy =
        threat === undefined
            ? undefined
            : HOSTILE_TROPHY_ITEMS[threat.archetype]
    const profile = profiles.find((entry) =>
        actor.tags.has(`worker.city.${entry.cityId}`)
    )
    if (
        adapter === undefined ||
        threat === undefined ||
        trophy === undefined ||
        profile === undefined
    ) {
        return undefined
    }
    const worksite = target ??
        adapter.findTarget(actor, room, now) ?? {
            kind: adapter.kind,
            sourceId: null,
            locationId: actor.locationId,
            position: { ...actor.position },
        }
    const request: WorkerIncident = {
        view: {
            id,
            cityId: profile.cityId,
            clerkId: profile.clerkId,
            workerId: actor.id,
            workerName: actor.nickname,
            locationId: worksite.locationId,
            locationName:
                getWorldLocationDefinition(worksite.locationId)?.name ??
                worksite.locationId,
            enemyName: threat.nickname,
            requiredTrophyItemId: trophy,
            proofAccepted: false,
            stage: 'reporting',
            reason: null,
        },
        cityId: profile.cityId,
        clerkId: profile.clerkId,
        target: structuredClone(worksite),
        attackPoint: {
            locationId: actor.locationId,
            position: { ...actor.position },
        },
        trialPoint: null,
        threatId: threat.id,
        threatArchetype: threat.archetype,
        adapter,
        claim: null,
        published: false,
        returnReady: false,
    }
    return request
}
