import type { Vector2 } from './index'
import type { ItemId } from './inventory'

export type WorkRequestStage =
    | 'reporting'
    | 'waiting'
    | 'outbound'
    | 'working'
    | 'returning'
    | 'ready'
    | 'completed'
    | 'cancelled'

export interface WorkRequestSnapshot {
    id: string
    cityId: string
    clerkId: string
    workerId: string
    workerName: string
    locationId: string
    locationName: string
    enemyName: string
    requiredTrophyItemId: ItemId
    proofAccepted: boolean
    stage: WorkRequestStage
    reason: string | null
}

export interface WorkerSettlementProfile {
    cityId: string
    clerkId: string
}

/** An authored worksite remains fixed throughout retries of its incident. */
export interface WorkerWorkTarget {
    kind: 'farm' | 'resource'
    sourceId: string | null
    locationId: string
    position: Vector2
}
