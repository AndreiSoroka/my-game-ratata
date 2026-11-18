import type { AgentDecision, Vector2 } from '@my-game-ratata/contracts'

import type { RegionalExit } from '../game/regionalNavigation'
import type { NpcGuideGoal } from './guideTargets'

export interface NpcAiGuide {
    id: string
    decision: Extract<AgentDecision, { type: 'guide' }>
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
}
