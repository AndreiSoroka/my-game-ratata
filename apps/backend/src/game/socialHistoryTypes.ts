import type { ReactionRequest, ReactionResult } from './characterReactions'

export type SocialIncidentKind =
    | 'introduction'
    | 'request'
    | 'insult'
    | 'threat'
    | 'theft'
    | 'attack'
    | 'news'
    | 'help'
    | 'honest_exchange'

export type SocialSeverity = 1 | 2 | 3 | 4 | 5

export interface SocialIncident {
    id: string
    kind: SocialIncidentKind
    actorId: string
    targetId: string
    locationId: string
    at: number
    severity: SocialSeverity
    visibility?: 'participants'
}

export interface KnownSocialIncident {
    incidentId: string
    kind: SocialIncidentKind
    actorId: string
    targetId: string
    locationId: string
    at: number
    learnedAt: number
    severity: SocialSeverity
    confidence: number
    believed: boolean
    firsthand: boolean
    witnessId: string
    heardFromId?: string
}

export interface SocialRelationship {
    liking: number
    trust: number
    respect: number
    grudge: number
}

export interface SocialReputation {
    honesty: number
    usefulness: number
    danger: number
}

export interface SocialHistoryWorld {
    participant(id: string):
        | {
              id: string
              locationId: string
              available: boolean
              canSpeak: boolean
          }
        | undefined
    residents(locationId: string): readonly string[]
    resentment?(id: string): number | undefined
    react(
        id: string,
        request: ReactionRequest,
        now: number
    ): ReactionResult | undefined
}

export interface SocialRumorEncounter {
    incidentId: string
    speakerId: string
    listenerId: string
    locationId: string
}

export type SocialRumorReceipt =
    | { status: 'unavailable' | 'already_attempted' | 'withheld' }
    | {
          status: 'told'
          transmissionId: string
          incident: SocialIncident
          knowledge: KnownSocialIncident
      }
