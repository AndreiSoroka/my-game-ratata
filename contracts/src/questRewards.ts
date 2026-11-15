export type QuestRewardMode = 'submitter' | 'party_equal'

export const DEFAULT_QUEST_REWARD_MODE: QuestRewardMode = 'party_equal'

export function isQuestRewardMode(value: unknown): value is QuestRewardMode {
    return value === 'submitter' || value === 'party_equal'
}

export interface QuestRewardShare {
    characterId: string
    gold: number
}

export interface QuestRewardRequest {
    receiptId: string
    totalGold: number
    mode: QuestRewardMode
    submitterId: string
    memberIds: readonly string[]
}

export type QuestRewardResult =
    | { ok: true; shares: QuestRewardShare[]; alreadyPaid: boolean }
    | { ok: false; shares: [] }
