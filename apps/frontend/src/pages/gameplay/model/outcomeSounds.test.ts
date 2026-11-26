import type { CharacterSnapshot, ConstellationId, WorldSnapshot } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { exchangeFixture } from '@/game/testing/socialFixtures'

import { adventureFixture, worldFixture } from '../../../game/testing/characterFixture'
import { masteriesFixture } from '../../../game/testing/masteryFixture'
import { faithKnownStatusFixture } from '../../../game/testing/playerStatusFixture'
import { createOutcomeSounds } from './outcomeSounds'

function hero(levels: Partial<Record<ConstellationId, number>>, id = 'hero'): CharacterSnapshot {
    const character = faithKnownStatusFixture()
    return {
        ...character,
        id,
        heroClass: 'arcanist',
        progression: { ...character.progression!, masteries: masteriesFixture(levels) },
    }
}

function world(
    tick: number,
    character: CharacterSnapshot,
    overrides: Partial<WorldSnapshot> = {}
): WorldSnapshot {
    return { ...worldFixture([character]), serverEpoch: 'world-1', tick, ...overrides }
}

describe('local outcome sounds', () => {
    it('sounds once for mastery gains and keeps known levels through missing or stale data', () => {
        const outcomes = createOutcomeSounds()
        const initial = hero({ magic: 2 })
        const increased = hero({ magic: 3, arrow: 1 })
        const incomplete = hero({})
        incomplete.progression!.masteries = []

        expect(outcomes.observe(world(4, initial), 'hero')?.sound).toBeUndefined()
        expect(outcomes.observe(world(4, increased), 'hero')?.sound).toBeUndefined()
        expect(outcomes.observe(world(5, incomplete), 'hero')?.sound).toBeUndefined()
        expect(outcomes.observe(world(3, hero({ magic: 4 })), 'hero')?.sound).toBeUndefined()
        expect(outcomes.observe(world(6, increased), 'hero')?.sound).toBe('masteryUp')
        expect(outcomes.observe(world(6, increased), 'hero')?.sound).toBeUndefined()
        expect(outcomes.observe(world(7, increased), 'hero')?.sound).toBeUndefined()
        expect(
            outcomes.observe(
                world(8, increased, { characters: [increased, hero({ magic: 9 }, 'ally')] }),
                'hero'
            )?.sound
        ).toBeUndefined()
        expect(outcomes.observe(world(9, initial), 'hero')?.sound).toBeUndefined()
        expect(outcomes.observe(world(10, increased), 'hero')?.sound).toBe('masteryUp')
    })

    it('silently establishes levels and receipts at each identity, epoch and connection baseline', () => {
        const outcomes = createOutcomeSounds()
        const reward = { adventure: { ...adventureFixture(), lastQuestRewardReceiptId: 'paid' } }
        const completed = world(5, hero({ magic: 7 }), reward)

        expect(outcomes.observe(world(4, hero({ magic: 2 })), 'hero')?.sound).toBeUndefined()
        expect(outcomes.observe(completed, 'hero')?.sound).toBe('masteryUp')
        expect(
            outcomes.observe(world(6, hero({ magic: 4 }, 'new'), reward), 'new')?.sound
        ).toBeUndefined()
        const newEpoch = world(1, hero({ magic: 5 }, 'new'), { ...reward, serverEpoch: 'world-2' })
        expect(outcomes.observe(newEpoch, 'new')?.sound).toBeUndefined()
        expect(createOutcomeSounds().observe(completed, 'hero')?.sound).toBeUndefined()
    })

    it('coalesces a quest receipt and a completed active exchange, without repeating either receipt', () => {
        const outcomes = createOutcomeSounds()
        const player = hero({})
        const active = exchangeFixture()
        const completed = exchangeFixture({ status: 'completed', receiptId: 'trade-paid' })
        const reward = (receipt: string): WorldSnapshot['adventure'] => ({
            ...adventureFixture(),
            lastQuestRewardReceiptId: receipt,
        })

        expect(
            outcomes.observe(world(1, player, { social: { exchange: active } }), 'hero')?.sound
        ).toBeUndefined()
        const firstPayment = { adventure: reward('quest-paid'), social: { exchange: completed } }
        expect(outcomes.observe(world(2, player, firstPayment), 'hero')?.sound).toBe(
            'uiConfirmation'
        )
        expect(outcomes.observe(world(3, player, firstPayment), 'hero')?.sound).toBeUndefined()

        const nextPayment = { adventure: reward('other-quest-paid'), social: { exchange: active } }
        expect(outcomes.observe(world(4, player, nextPayment), 'hero')?.sound).toBe(
            'uiConfirmation'
        )
        expect(outcomes.observe(world(5, player, firstPayment), 'hero')?.sound).toBeUndefined()
    })

    it('requires a matching active trade and consumes a real completion even when mastery takes priority', () => {
        const outcomes = createOutcomeSounds()
        const player = hero({})
        const active = exchangeFixture()
        const mismatched = exchangeFixture({
            id: 'other',
            status: 'completed',
            receiptId: 'other-paid',
        })
        const completed = exchangeFixture({ status: 'completed', receiptId: 'trade-paid' })

        outcomes.observe(world(1, player, { social: { exchange: active } }), 'hero')
        expect(
            outcomes.observe(world(2, player, { social: { exchange: mismatched } }), 'hero')?.sound
        ).toBeUndefined()
        outcomes.observe(world(3, player, { social: { exchange: active } }), 'hero')
        const increased = hero({ magic: 1 })
        const result = { social: { exchange: completed } }
        expect(outcomes.observe(world(4, increased, result), 'hero')?.sound).toBe('masteryUp')
        expect(outcomes.observe(world(5, increased, result), 'hero')?.sound).toBeUndefined()
        const nextActive = exchangeFixture({ id: 'next' })
        const nextCompleted = exchangeFixture({
            id: 'next',
            status: 'completed',
            receiptId: 'next-paid',
        })
        outcomes.observe(world(6, increased, { social: { exchange: nextActive } }), 'hero')
        expect(
            outcomes.observe(world(7, increased, { social: { exchange: nextCompleted } }), 'hero')
                ?.sound
        ).toBe('uiConfirmation')
    })
})
