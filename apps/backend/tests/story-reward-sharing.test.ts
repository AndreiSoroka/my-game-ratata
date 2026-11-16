import { describe, expect, it } from 'vitest'

import { createAdventureState } from '../src/game/adventureState'
import { createItemInstance } from '../src/game/inventory'
import { turnInHearts } from '../src/game/trophyQuest'
import { heartFixture, heartOtherHero } from './heartTestHelpers'

describe('story reward distribution', () => {
    it('stores the accepted mode, includes late group members, and only completes the owner’s story', () => {
        const f = heartFixture()
        f.accept()
        expect(f.snapshot().quest.rewardMode).toBe('party_equal')
        const other = heartOtherHero()
        f.service.setQuestRewardMembers(() => [f.actor.id, other.id, 'third'])
        f.bring()
        f.service.choose(
            f.actor,
            'turn_in_trophies',
            [f.mira],
            undefined,
            f.clock.now,
            'submitter'
        )
        expect(f.snapshot()).toMatchObject({
            gold: 14,
            quest: { status: 'completed', rewardMode: 'party_equal' },
        })
        expect(f.service.snapshot(other.id).gold).toBe(13)
        expect(f.service.snapshot(other.id).quest.status).toBe('available')
        expect(f.service.snapshot('third').gold).toBe(13)
        f.service.choose(f.actor, 'turn_in_trophies', [f.mira])
        expect(f.snapshot().gold).toBe(14)
    })

    it('keeps the entire fixed reward for the submitter when selected at acceptance', () => {
        const f = heartFixture()
        f.service.interact(f.actor, f.mira.id, [f.mira])
        f.service.choose(
            f.actor,
            'accept_quest',
            [f.mira],
            undefined,
            f.clock.now,
            'submitter'
        )
        f.service.setQuestRewardMembers(() => [f.actor.id, 'late'])
        f.bring()
        f.service.choose(f.actor, 'turn_in_trophies', [f.mira])
        expect(f.snapshot()).toMatchObject({
            gold: 40,
            quest: { rewardMode: 'submitter' },
        })
        expect(f.service.snapshot('late').gold).toBe(0)
    })

    it('preserves all hearts and completion state when the shared payment is rejected', () => {
        const f = heartFixture()
        const state = createAdventureState()
        state.questStatus = 'active'
        state.questRewardMode = 'party_equal'
        f.actor.inventory = Array.from({ length: 3 }, () =>
            createItemInstance('slime_heart')
        )
        const before = [...f.actor.inventory]
        expect(
            turnInHearts(state, f.actor, {
                award: () => ({ ok: false, shares: [] }),
            })
        ).toBe(false)
        expect(f.actor.inventory).toEqual(before)
        expect(state.questStatus).toBe('active')
        expect(state.rewardKeys.size).toBe(0)
        expect(state.gold).toBe(0)
    })
})
