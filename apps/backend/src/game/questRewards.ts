import type {
    QuestRewardRequest,
    QuestRewardResult,
    QuestRewardShare,
} from '@my-game-ratata/contracts'
import { isQuestRewardMode } from '@my-game-ratata/contracts'

export type QuestGoldAwarder = (
    request: QuestRewardRequest
) => QuestRewardResult

/** The submitter receives the first leftover coin, then stable character IDs. */
export function planQuestReward(
    request: QuestRewardRequest
): QuestRewardShare[] | undefined {
    if (
        request.receiptId.length === 0 ||
        request.submitterId.length === 0 ||
        !Number.isSafeInteger(request.totalGold) ||
        request.totalGold <= 0 ||
        !isQuestRewardMode(request.mode) ||
        request.memberIds.some((id) => id.length === 0)
    ) {
        return undefined
    }
    const recipients =
        request.mode === 'submitter'
            ? [request.submitterId]
            : [
                  request.submitterId,
                  ...[...new Set(request.memberIds)]
                      .filter((id) => id !== request.submitterId)
                      .sort(),
              ]
    const base = Math.floor(request.totalGold / recipients.length)
    const remainder = request.totalGold % recipients.length
    return recipients.map((characterId, index) => ({
        characterId,
        gold: base + (index < remainder ? 1 : 0),
    }))
}
