import type {
    QuestRewardRequest,
    QuestRewardResult,
    QuestRewardShare,
} from '@my-game-ratata/contracts'

import { createAdventureState, type PlayerAdventure } from './adventureState'
import { planAssetSettlement } from './assetSettlement'
import { setNotice } from './notices'
import {
    type FundedQuestSettlement,
    planQuestReward,
    type QuestGoldAwarder,
} from './questRewards'

interface Receipt {
    mode: QuestRewardRequest['mode']
    submitterId: string
    totalGold: number
    shares: QuestRewardShare[]
}
interface WalletShare {
    share: QuestRewardShare
    state: PlayerAdventure
}

function repeatReceipt(
    previous: Receipt,
    request: QuestRewardRequest
): QuestRewardResult {
    return previous.mode === request.mode &&
        previous.submitterId === request.submitterId &&
        previous.totalGold === request.totalGold
        ? {
              ok: true,
              alreadyPaid: true,
              shares: structuredClone(previous.shares),
          }
        : { ok: false, shares: [] }
}

function commitFundedPayment(
    settlement: FundedQuestSettlement,
    totalGold: number,
    wallets: readonly WalletShare[]
): boolean {
    const incoming = new Map<object, number>()
    for (const transfer of settlement.assets.gold) {
        incoming.set(
            transfer.to,
            (incoming.get(transfer.to) ?? 0) + transfer.amount
        )
    }
    if (
        settlement.assets.gold.reduce((sum, entry) => sum + entry.amount, 0) !==
            totalGold ||
        wallets.some(
            ({ share, state }) => (incoming.get(state) ?? 0) !== share.gold
        )
    ) {
        return false
    }
    return planAssetSettlement(settlement.assets)?.commit() === true
}

/** One receipt covers both the finite payer and every real item transfer. */
export function createQuestGoldAwarder(
    states: Map<string, PlayerAdventure>
): QuestGoldAwarder {
    const receipts = new Map<string, Receipt>()
    return (request, settlement) => {
        const planned = planQuestReward(request, settlement !== undefined)
        if (planned === undefined) {
            return { ok: false, shares: [] }
        }
        const previous = receipts.get(request.receiptId)
        if (previous !== undefined) {
            return repeatReceipt(previous, request)
        }
        const wallets = planned.map((share) => ({
            share,
            state: states.get(share.characterId) ?? createAdventureState(),
        }))
        if (
            wallets.some(
                ({ share, state }) =>
                    state.rewardKeys.has(request.receiptId) ||
                    !Number.isSafeInteger(state.gold + share.gold)
            )
        ) {
            return { ok: false, shares: [] }
        }
        if (
            settlement !== undefined &&
            !commitFundedPayment(settlement, request.totalGold, wallets)
        ) {
            return { ok: false, shares: [] }
        }
        for (const { share, state } of wallets) {
            states.set(share.characterId, state)
            if (settlement === undefined) {
                state.gold += share.gold
            }
            state.rewardKeys.add(request.receiptId)
            setNotice(
                state,
                `Награда за задание: ${String(share.gold)} золотых.`
            )
        }
        receipts.set(request.receiptId, {
            mode: request.mode,
            submitterId: request.submitterId,
            totalGold: request.totalGold,
            shares: structuredClone(planned),
        })
        return { ok: true, alreadyPaid: false, shares: planned }
    }
}
