import type {
    QuestRewardRequest,
    QuestRewardShare,
} from '@my-game-ratata/contracts'

import { createAdventureState, type PlayerAdventure } from './adventureState'
import { creditWallet, drainWallet, spendWallet } from './corpseWallet'
import { setNotice } from './notices'
import { planQuestReward, type QuestGoldAwarder } from './questRewards'
export function grantAdventureGoldOnce(
    state: PlayerAdventure,
    amount: number,
    rewardId: string
): boolean {
    if (
        !Number.isSafeInteger(amount) ||
        amount <= 0 ||
        !Number.isSafeInteger(state.gold + amount) ||
        state.rewardKeys.has(rewardId)
    ) {
        return false
    }
    state.rewardKeys.add(rewardId)
    state.gold += amount
    setNotice(state, `Гильдия выплатила ${String(amount)} золотых.`)
    return true
}

export function getAdventureState(
    states: Map<string, PlayerAdventure>,
    id: string
): PlayerAdventure {
    const existing = states.get(id)
    if (existing !== undefined) {
        return existing
    }
    const state = createAdventureState()
    states.set(id, state)
    return state
}

export function createAdventureWalletActions(
    states: Map<string, PlayerAdventure>
) {
    const stateFor = (id: string) => getAdventureState(states, id)
    const receipts = new Map<
        string,
        {
            mode: QuestRewardRequest['mode']
            submitterId: string
            totalGold: number
            shares: QuestRewardShare[]
        }
    >()
    const grantQuestGoldOnce: QuestGoldAwarder = (request) => {
        const planned = planQuestReward(request)
        if (planned === undefined) {
            return { ok: false, shares: [] }
        }
        const previous = receipts.get(request.receiptId)
        if (previous !== undefined) {
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
        for (const { share, state } of wallets) {
            states.set(share.characterId, state)
            state.gold += share.gold
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
    return {
        grantQuestGoldOnce,
        grantGoldOnce: (id: string, amount: number, receipt: string) =>
            grantAdventureGoldOnce(stateFor(id), amount, receipt),
        trySpendGold: (id: string, amount: number) =>
            spendWallet(stateFor(id), amount),
        drainGold: (id: string) => drainWallet(stateFor(id)),
        creditLootGold: (id: string, amount: number) =>
            creditWallet(stateFor(id), amount),
    }
}
