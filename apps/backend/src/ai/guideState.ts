import type { AgentDecision, Vector2 } from '@my-game-ratata/contracts'

import type { RegionalExit } from '../game/regionalNavigation'
import type { NpcGuideGoal } from './guideTargets'
import type { NpcAiEvent } from './types'

export interface NpcAiGuide {
    id: string
    decision: Extract<AgentDecision, { type: 'guide' | 'travel_to' }>
    locationId: string
    destination: Vector2
    waitingSince?: number
    deadline: number
    legDeadline?: number
    goal?: NpcGuideGoal
    route?: string[]
    exit?: RegionalExit | undefined
    crossingGraceUntil?: number | undefined
    awaitingPartner?: boolean
    escortId?: string
    escortMissingSince?: number
    enteringBuilding?: boolean
}

export function guideReceipt(
    guide: NpcAiGuide,
    status: 'completed' | 'failed',
    reason: string,
    now: number
): NpcAiEvent {
    return {
        kind: 'action',
        id: guide.id,
        decision: guide.decision,
        status,
        reason,
        at: now,
    }
}
