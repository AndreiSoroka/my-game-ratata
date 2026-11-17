import type {
    AgentDecision,
    CompanionWaitMode,
    SpeechFocus,
    Vector2,
} from '@my-game-ratata/contracts'

import type { NpcAiObservation } from './observation'

export type NpcAiRole = 'city_coordinator' | 'companion'

export interface NpcAiModelSettings {
    cliPath: string
    model: string
    reasoningEffort: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra'
    serviceTier: 'default' | 'fast'
    timeoutMs: number
}

export interface NpcAiConfig {
    enabled: boolean
    defaults: NpcAiModelSettings
    limits: {
        maxCallsPerHour: number
        maxDecisionsPerTask: number
        reviewIntervalMs: number
        retryDelayMs: number
    }
    npcs: NpcAiActorConfig[]
}

export interface NpcAiActorConfig {
    actorId: string
    role: NpcAiRole
    settings: NpcAiModelSettings
}

export interface NpcAiTask {
    audienceKey?: string
    sourceId?: string
    id: string
    requesterId: string | null
    request: string
    steps: number
    lastKnownRequester?: { locationId: string; position: Vector2 }
}

export type NpcAiEvent =
    | {
          kind: 'message'
          channel?: 'say' | 'whisper'
          ambiguous?: boolean
          legacy?: boolean
          system?: boolean
          claimedBy?: string
          id: string
          senderId: string
          text: string
          locationId: string
          position: Vector2
          at: number
          focus?: SpeechFocus
          actorPosition?: Vector2
          actorLocationId?: string
      }
    | {
          kind: 'action'
          id: string
          status: 'completed' | 'failed' | 'cancelled'
          reason: string
          decision: AgentDecision
          at: number
      }
    | { kind: 'world'; id: string; reason: string; at: number }

export type NpcAiFact =
    | {
          kind: 'merchant'
          merchantId: string
          observedAt: number
          offers: unknown
      }
    | {
          kind: 'inspection'
          targetId: string
          observedAt: number
          information: string[]
          workerActivity?: import('@my-game-ratata/contracts').WorkerActivitySnapshot
      }

export interface NpcAiContext {
    actorId: string
    role: NpcAiRole
    personality: string
    task: NpcAiTask | null
    events: NpcAiEvent[]
    memory: string
    facts: NpcAiFact[]
    observation: NpcAiObservation
}

export interface NpcAiReply {
    speech?: string | null
    taskAcceptance?: 'none' | 'accept' | 'replace' | 'decline'
    companionOrder?: 'follow' | 'guard' | 'help' | 'dismiss' | 'wait' | null
    waitMode?: CompanionWaitMode | null
    decision: AgentDecision | null
    memory: string
    done: boolean
    waitMs: number
    diagnostics?: NpcAiDiagnostic[]
}

export interface NpcAiDiagnostic {
    kind: 'missing_capability' | 'blocked' | 'uncertain'
    capability: string
    detail: string
    attempted: string
}

export interface NpcAiProvider {
    decide(
        context: NpcAiContext,
        settings: NpcAiModelSettings,
        signal: AbortSignal
    ): Promise<NpcAiReply>
}
