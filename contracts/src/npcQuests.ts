import type {
    CharacterArchetype,
    ItemId,
    ItemInstanceSnapshot,
    Vector2,
} from './index'
import type { QuestRewardMode, QuestRewardShare } from './questRewards'

export type QuestObjective =
    | { kind: 'deliver'; itemId: ItemId; quantity: number; recipientId: string }
    | { kind: 'visit'; locationId: string; position?: Vector2 }
    | {
          kind: 'defeat'
          archetype: CharacterArchetype
          quantity: number
          locationId: string
      }
    | { kind: 'inspect'; targetId: string; question?: string }

/** Untrusted narrative and references, never executable game rules. */
export interface QuestDraft {
    title: string
    description: string
    objectives: QuestObjective[]
    rewardGold: number
    rewardItems: Array<{ instanceId: string; quantity: number }>
    funding: 'personal' | 'city'
}

export interface QuestOfferSnapshot {
    fundingCityId?: string
    objectiveLabels?: string[]
    id: string
    revision: number
    issuerId: string
    issuerName: string
    title: string
    description: string
    objectives: QuestObjective[]
    rewardGold: number
    rewardItems: ItemInstanceSnapshot[]
    funding: 'personal' | 'city' | 'worker'
    rewardMode: QuestRewardMode
    itemRecipient: 'submitter'
    expiresAt: number
    workerRequestId?: string
}

export interface NpcQuestSnapshot extends QuestOfferSnapshot {
    instanceId: string
    progress: number[]
    status: 'active' | 'ready' | 'completed' | 'cancelled' | 'reward_missing'
    notice: string | null
    receiptId?: string
    rewardShares?: QuestRewardShare[]
}

export type NpcQuestClientMessage =
    | {
          type: 'quest_offer_answer'
          offerId: string
          revision: number
          accept: boolean
          rewardMode?: QuestRewardMode
      }
    | { type: 'npc_quest_turn_in'; instanceId: string }
    | { type: 'npc_quest_abandon'; instanceId: string }
    | { type: 'quest_inquire'; instanceId: string; objectiveIndex: number }
    | { type: 'quest_turn_in_confirm'; confirmationId: string; accept: boolean }

export type NpcQuestDecision =
    | { type: 'quest_propose'; targetId: string; draft: QuestDraft }
    | { type: 'worker_quest_propose'; targetId: string; requestId: string }
    | { type: 'quest_turn_in_request'; targetId: string; instanceId: string }
    | {
          type: 'quest_offer_revise'
          targetId: string
          offerId: string
          revision: number
          rewardGold: number
          rewardItems: Array<{ instanceId: string; quantity: number }>
      }
    | { type: 'quest_inquire'; instanceId: string; objectiveIndex: number }

export interface QuestTurnInPromptSnapshot {
    id: string
    instanceId: string
    source: 'npc' | 'guild' | 'story'
    issuerId: string
    issuerName: string
    title: string
    description: string
    objectives: QuestObjective[]
    objectiveLabels: string[]
    rewardGold: number
    rewardItems: ItemInstanceSnapshot[]
    rewardMode: QuestRewardMode
    expiresAt: number
    revision: number
    action?: 'report' | 'turn_in'
}

export interface QuestHistoryEntry {
    id: string
    instanceId?: string
    source: 'npc' | 'guild' | 'story'
    issuerId: string
    recipientId: string
    title: string
    status:
        | 'offered'
        | 'revised'
        | 'declined'
        | 'expired'
        | 'active'
        | 'ready'
        | 'completed'
        | 'cancelled'
        | 'reward_missing'
    at: number
    revision?: number
    rewardGold: number
    receiptId?: string
    nextAction?: string
    contactId?: string
    contactName?: string
    locationId?: string
}

export interface NpcQuestSocialSnapshot {
    questTurnIn?: QuestTurnInPromptSnapshot | null
    questHistory?: QuestHistoryEntry[]
    issuerQuests?: NpcQuestSnapshot[]
    questOffer?: QuestOfferSnapshot | null
    quest?: NpcQuestSnapshot | null
}
