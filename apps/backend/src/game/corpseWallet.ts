import type { PlayerAdventure } from './adventureState'

/** A finite authoritative balance shared by every controller. */
export interface CorpseWallet {
    drainGold(actorId: string): number
    creditLootGold(actorId: string, amount: number): boolean
}

export function drainWallet(state: PlayerAdventure): number {
    const amount = state.gold
    state.gold = 0
    return amount
}

export function spendWallet(state: PlayerAdventure, amount: number): boolean {
    if (!Number.isSafeInteger(amount) || amount <= 0 || state.gold < amount) {
        return false
    }
    state.gold -= amount
    return true
}

export function creditWallet(state: PlayerAdventure, amount: number): boolean {
    if (
        !Number.isSafeInteger(amount) ||
        amount <= 0 ||
        !Number.isSafeInteger(state.gold + amount)
    ) {
        return false
    }
    state.gold += amount
    return true
}
