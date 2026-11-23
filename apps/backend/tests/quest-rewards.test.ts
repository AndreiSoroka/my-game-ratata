import type { QuestRewardRequest } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import {
    createAdventureState,
    type PlayerAdventure,
} from '../src/game/adventureState'
import { createAdventureWalletActions } from '../src/game/adventureWallet'
import { planQuestReward } from '../src/game/questRewards'

const request: QuestRewardRequest = {
    receiptId: 'contract:one',
    totalGold: 40,
    mode: 'party_equal',
    submitterId: 'z-submitter',
    memberIds: ['b', 'a', 'z-submitter', 'a'],
}

describe('one fixed quest budget', () => {
    it('gives the first remainder coin to the submitter and the rest to stable IDs', () => {
        expect(planQuestReward(request)).toEqual([
            { characterId: 'z-submitter', gold: 14 },
            { characterId: 'a', gold: 13 },
            { characterId: 'b', gold: 13 },
        ])
        expect(
            planQuestReward({
                ...request,
                totalGold: 2,
                memberIds: ['c', 'b', 'a'],
            })
        ).toEqual([
            { characterId: 'z-submitter', gold: 1 },
            { characterId: 'a', gold: 1 },
            { characterId: 'b', gold: 0 },
            { characterId: 'c', gold: 0 },
        ])
    })

    it('pays only the submitter in submitter mode and all gold when solo', () => {
        expect(planQuestReward({ ...request, mode: 'submitter' })).toEqual([
            { characterId: 'z-submitter', gold: 40 },
        ])
        expect(planQuestReward({ ...request, memberIds: [] })).toEqual([
            { characterId: 'z-submitter', gold: 40 },
        ])
    })

    it('rejects invalid amounts without creating wallets', () => {
        const states = new Map<string, PlayerAdventure>()
        const wallet = createAdventureWalletActions(states)
        for (const totalGold of [
            -1,
            0,
            0.5,
            Infinity,
            Number.MAX_SAFE_INTEGER + 1,
        ]) {
            expect(
                wallet.grantQuestGoldOnce({ ...request, totalGold }).ok
            ).toBe(false)
        }
        expect(states.size).toBe(0)
    })
})

describe('atomic quest payments and receipts', () => {
    it('preflights all balances, then can retry the same unspent receipt', () => {
        const blocked = createAdventureState()
        blocked.gold = Number.MAX_SAFE_INTEGER
        blocked.lastQuestRewardReceiptId = 'contract:previous'
        const states = new Map([['b', blocked]])
        const wallet = createAdventureWalletActions(states)
        expect(wallet.grantQuestGoldOnce(request).ok).toBe(false)
        expect(states.size).toBe(1)
        expect(blocked.gold).toBe(Number.MAX_SAFE_INTEGER)
        expect(blocked.rewardKeys.size).toBe(0)
        expect(blocked.lastQuestRewardReceiptId).toBe('contract:previous')
        blocked.gold = 0
        expect(wallet.grantQuestGoldOnce(request)).toMatchObject({
            ok: true,
            alreadyPaid: false,
        })
        expect(
            [...states.values()].reduce((total, state) => total + state.gold, 0)
        ).toBe(40)
        expect(blocked.lastQuestRewardReceiptId).toBe(request.receiptId)
    })

    it('keeps the first payout frozen across repeats and roster changes', () => {
        const states = new Map<string, PlayerAdventure>()
        const wallet = createAdventureWalletActions(states)
        const first = wallet.grantQuestGoldOnce(request)
        const repeat = wallet.grantQuestGoldOnce({
            ...request,
            memberIds: ['late'],
        })
        expect(repeat).toEqual({ ...first, alreadyPaid: true })
        expect(states.has('late')).toBe(false)
        expect(
            [...states.values()].reduce((total, state) => total + state.gold, 0)
        ).toBe(40)
        expect(
            wallet.grantQuestGoldOnce({ ...request, mode: 'submitter' }).ok
        ).toBe(false)
        const share = first.shares[0]
        if (share !== undefined) {
            share.gold = 999
        }
        expect(wallet.grantQuestGoldOnce(request).shares[0]?.gold).toBe(14)
    })

    it('does not let a share in another identity’s story consume your own story receipt', () => {
        const states = new Map<string, PlayerAdventure>()
        const wallet = createAdventureWalletActions(states)
        wallet.grantQuestGoldOnce({
            ...request,
            receiptId: 'story:one:bell',
            submitterId: 'one',
            memberIds: ['two'],
        })
        wallet.grantQuestGoldOnce({
            ...request,
            receiptId: 'story:two:bell',
            submitterId: 'two',
            memberIds: ['one'],
        })
        expect(states.get('one')?.gold).toBe(40)
        expect(states.get('two')?.gold).toBe(40)
        expect(states.get('one')?.lastQuestRewardReceiptId).toBe(
            'story:two:bell'
        )
        expect(states.get('two')?.lastQuestRewardReceiptId).toBe(
            'story:two:bell'
        )
        expect(
            wallet.grantQuestGoldOnce({
                ...request,
                receiptId: 'story:one:bell',
                submitterId: 'one',
                memberIds: ['two'],
            })
        ).toMatchObject({ ok: true, alreadyPaid: true })
        expect(states.get('one')?.lastQuestRewardReceiptId).toBe(
            'story:two:bell'
        )
    })

    it('records the reward cue only for the submitter and paid party members', () => {
        const states = new Map<string, PlayerAdventure>()
        const wallet = createAdventureWalletActions(states)
        wallet.grantQuestGoldOnce({ ...request, totalGold: 2 })
        expect(states.get('z-submitter')?.lastQuestRewardReceiptId).toBe(
            request.receiptId
        )
        expect(states.get('a')?.lastQuestRewardReceiptId).toBe(
            request.receiptId
        )
        expect(states.get('b')?.lastQuestRewardReceiptId).toBeUndefined()
    })
})
