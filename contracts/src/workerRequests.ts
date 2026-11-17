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

export interface WorkerActivitySnapshot {
    reason:
        | 'threat'
        | 'seeds'
        | 'plots'
        | 'stock_sufficient'
        | 'break'
        | 'working'
        | 'request'
        | 'route'
        | 'supplier'
        | 'bag'
        | 'unavailable'
        | 'repair'
        | 'exchange'
        | 'conversation'
        | 'control'
        | 'reaction'
        | 'scenario'
    text: string
    intent?:
        | 'work'
        | 'sow'
        | 'harvest'
        | 'deliver'
        | 'get_seed'
        | 'report'
        | 'check_work'
        | 'return'
        | 'wait'
        | 'repair'
    worksite?: WorkerWorkTarget
    stage?: WorkRequestStage
    since?: number
    observedAt?: number
    danger?: { status: 'observed' | 'reported'; observedAt: number }
    lastResult?: {
        receiptId: string
        at: number
        accepted: boolean
        command: string
        reason: string | null
    }
    until?: number
    requestId?: string
}
