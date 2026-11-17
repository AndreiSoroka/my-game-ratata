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
    | { kind: 'inspect'; targetId: string }

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

export type NpcQuestDecision =
    | { type: 'quest_propose'; targetId: string; draft: QuestDraft }
    | { type: 'worker_quest_propose'; targetId: string; requestId: string }

export interface NpcQuestSocialSnapshot {
    issuerQuests?: NpcQuestSnapshot[]
    questOffer?: QuestOfferSnapshot | null
    quest?: NpcQuestSnapshot | null
}
