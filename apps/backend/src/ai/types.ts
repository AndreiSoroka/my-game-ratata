import type {
    AgentDecision,
    CompanionWaitMode,
    GameLocale,
    SpeechFocus,
    Vector2,
} from '@my-game-ratata/contracts'

import type {
    NecromancerModelContext,
    NecromancerModelDecision,
} from '../game/necromancerTactics'
import type { NpcConversationFeedback } from '../game/roomConversationDepartures'
import type { NpcAiObservation } from './observation'

export type NpcAiRole =
    'city_coordinator' | 'companion' | 'advisor' | 'necromancer'

export interface NpcAiModelSettings {
    cliPath: string
    model: string
    reasoningEffort: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra'
    serviceTier: 'default' | 'fast'
    timeoutMs: number
}

export interface NpcAiConfig {
    /** Disable proactive turns for controlled fixtures or dialogue-only integrations. */
    proactive?: boolean
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
    mode?: 'controller' | 'dialogue_only'
}

export interface NpcAiTask {
    background?: 'greeting' | 'self_activity'
    targetId?: string
    deadline?: number
    audienceKey?: string
    sourceId?: string
    id: string
    requesterId: string | null
    request: string
    language?: GameLocale
    steps: number
    lastKnownRequester?: { locationId: string; position: Vector2 }
    /** A completed guide permits one closing reply, never another physical step. */
    concluding?: boolean
}

export type NpcAiEvent =
    | {
          kind: 'message'
          channel?: 'say' | 'whisper'
          ambiguous?: boolean
          legacy?: boolean
          system?: boolean
          conversationId?: string
          replyDeadline?: number
          claimedBy?: string
          id: string
          senderId: string
          text: string
          language?: GameLocale
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
          kind: 'scouting'
          locationId: string
          position: Vector2
          observedAt: number
          visible: Array<{
              id: string
              name: string
              kind: string
              position: Vector2
          }>
          scope: 'visible_only'
      }
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

export interface NpcAiContext extends NpcConversationFeedback {
    cityStory?: import('./npcCityStoryContext').NpcCityStoryContext
    socialOpportunity?: import('./npcInitiative').NpcGreetingOpportunity
    commandCapabilities?: {
        canFollow: boolean
        canFight: boolean
        serviceOffers?: ReadonlyArray<
            import('../game/npcRoster').NpcServiceOffer
        >
        movementScope: 'city' | 'region' | 'none'
        orders: Partial<
            Record<
                NonNullable<NpcAiReply['companionOrder']>,
                {
                    allowed: boolean
                    reason?: import('../game/companionCommand').CompanionDenial
                }
            >
        >
    }
    actorId: string
    role: NpcAiRole
    personality: string
    speechLanguage?: GameLocale
    speechLanguagesByTarget?: Record<string, GameLocale>
    questOfferLanguage?: GameLocale
    task: NpcAiTask | null
    events: NpcAiEvent[]
    memory: string
    facts: NpcAiFact[]
    observation: NpcAiObservation
    conversation?: ReturnType<
        import('./characterMemory').CharacterMemory['context']
    >
    knowledgeScope?: import('./knowledgeScope').NpcKnowledgeScope
    knowledge?: import('./characterKnowledge').KnowledgeResult & {
        query?: string
    }
    informationResults?: import('./characterMemory').DeepMemoryResult
    taskConsent?: NpcTaskConsent
    speechStyle?: import('./npcSpeechInstructions').NpcSpeechContext
    selfIdentity?: import('./npcIdentityInstructions').NpcSelfIdentityContext
    replyCorrection?: {
        /** Internal rejected draft, never delivered speech or a memory record. */
        draftSpeech?: string | null
        code: NpcReplyIssue
        reason?: { code: string; detail: string }
        decision: AgentDecision | null
        taskAcceptance: NonNullable<NpcAiReply['taskAcceptance']>
        companionOrder: NpcAiReply['companionOrder']
        informationRequest?: NpcInformationRequest | null
    }
}

export interface NpcTaskConsent {
    state: 'idle' | 'own_task' | 'busy'
    allowed: Array<NonNullable<NpcAiReply['taskAcceptance']>>
}

export type NpcReplyIssue =
    | 'information_request_mixed'
    | 'task_consent_required'
    | 'task_replace_required'
    | 'task_unavailable'
    | 'task_concluded'
    | 'command_unavailable'
    | 'speech_language'
    | 'memory_changed'

export type NpcInformationRequest =
    | { type: 'deep_memory'; personId: string }
    | { type: 'knowledge_search'; query: string }

export interface NpcAiReply {
    offerService?: import('../game/npcRoster').NpcServiceOffer | null
    informationRequest?: NpcInformationRequest | null
    personMemoryUpdate?: import('./characterMemory').PersonMemoryUpdate | null
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
    decideNecromancer?(
        context: NecromancerModelContext,
        settings: NpcAiModelSettings,
        signal: AbortSignal
    ): Promise<NecromancerModelDecision>
}
