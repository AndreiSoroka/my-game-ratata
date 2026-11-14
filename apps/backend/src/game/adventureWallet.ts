import { createAdventureState, type PlayerAdventure } from './adventureState'
import { creditWallet, drainWallet, spendWallet } from './corpseWallet'
import { setNotice } from './notices'
export function grantAdventureGoldOnce(
    state: PlayerAdventure,
    amount: number,
    rewardId: string
): boolean {
    if (
        !Number.isSafeInteger(amount) ||
        amount <= 0 ||
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
    return {
        grantGoldOnce: (id: string, amount: number, receipt: string) =>
            grantAdventureGoldOnce(stateFor(id), amount, receipt),
        trySpendGold: (id: string, amount: number) =>
            spendWallet(stateFor(id), amount),
        drainGold: (id: string) => drainWallet(stateFor(id)),
        creditLootGold: (id: string, amount: number) =>
            creditWallet(stateFor(id), amount),
    }
}
