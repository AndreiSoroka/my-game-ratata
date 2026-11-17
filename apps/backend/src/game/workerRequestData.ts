import {
    type AdventureClientMessage,
    type AdventureResourceNode,
    CENTER_LOCATION_ID,
    type CharacterArchetype,
    type WorkerActivitySnapshot,
    type WorkerSettlementProfile,
    type WorkerWorkTarget,
    type WorkRequestSnapshot,
} from '@my-game-ratata/contracts'

import type { WorkerWorkAdapter } from './workerRequestWork'

export const WORKER_SETTLEMENT_PROFILES: readonly WorkerSettlementProfile[] = [
    { cityId: CENTER_LOCATION_ID, clerkId: 'npc_friendly_girl_1' },
]
export const WORKER_REQUEST_ORPHAN_MS = 300_000
export const WORKER_REQUEST_RADIUS = 160

export interface WorkerRequestClaim {
    key: string
    members: Set<string>
    lastOnlineAt: number
}

export interface WorkerIncident {
    view: WorkRequestSnapshot
    cityId: string
    clerkId: string
    target: WorkerWorkTarget
    attackPoint: { locationId: string; position: { x: number; y: number } }
    trialPoint: {
        locationId: string
        position: { x: number; y: number }
    } | null
    threatId: string
    threatArchetype: CharacterArchetype
    adapter: WorkerWorkAdapter
    claim: WorkerRequestClaim | null
    published: boolean
    returnReady: boolean
    threatObservedAt?: number
    activityReason?: WorkerActivitySnapshot['reason']
    activityIntent?: WorkerActivitySnapshot['intent']
    activityUntil?: number
}

export function viewWorkerIncident(
    request: WorkerIncident | undefined
): WorkRequestSnapshot | null {
    return request === undefined ? null : structuredClone(request.view)
}

export function publishedWorkerViews(
    requests: Iterable<WorkerIncident>,
    cityId?: string
): WorkRequestSnapshot[] {
    return [...requests]
        .filter(
            (request) =>
                request.published &&
                openIncident(request) &&
                request.claim === null &&
                (cityId === undefined || request.cityId === cityId)
        )
        .map((request) => structuredClone(request.view))
}

export function openIncident(incident: WorkerIncident): boolean {
    return !['completed', 'cancelled'].includes(incident.view.stage)
}

/** Blocking is independent of which controller currently owns the worker. */
export function isWorkerProduction(message: AdventureClientMessage): boolean {
    return [
        'gather',
        'farm_action',
        'farm_supply',
        'craft',
        'plant_tree',
        'market_trade',
        'repair_items',
    ].includes(message.type)
}

export function resourceWorkTarget(
    node: AdventureResourceNode | undefined
): WorkerWorkTarget | undefined {
    return node === undefined
        ? undefined
        : {
              kind: 'resource',
              sourceId: node.id,
              locationId: node.locationId,
              position: { ...node.position },
          }
}
