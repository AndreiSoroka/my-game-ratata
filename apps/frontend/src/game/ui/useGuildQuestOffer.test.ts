import type { PartySnapshot, WorldSnapshot } from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'
import { effectScope, ref, shallowRef } from 'vue'

import { worldFixture } from '../testing/characterFixture'
import { guildQuestFixture } from '../testing/questFixture'
import { useGuildQuestOffer } from './useGuildQuestOffer'

function fixture() {
    const party: PartySnapshot = {
        activeJob: null,
        guildContact: { npcId: 'clerk', nickname: 'Мира' },
        invitations: [],
        jobs: [guildQuestFixture()],
        leaderId: null,
        members: [],
        notice: null,
        partyId: null,
    }
    const snapshot = shallowRef<WorldSnapshot>({ ...worldFixture([]), party })
    const playerId = ref('hero')
    const scope = effectScope()
    const offer = scope.run(() =>
        useGuildQuestOffer({
            available: () => true,
            playerId: () => playerId.value,
            snapshot: () => snapshot.value,
        })
    )!
    function updateParty(update: Partial<PartySnapshot>): void {
        snapshot.value = { ...snapshot.value, party: { ...party, ...update } }
    }
    return { offer, updateParty, playerId, stop: () => scope.stop() }
}

it('produces one acceptance only after confirming, using the latest offer terms', () => {
    const { offer, updateParty, stop } = fixture()
    try {
        expect(offer.open('slime_hunt')).toBe(true)
        offer.close()
        expect(offer.accept('party_equal')).toBeUndefined()
        expect(offer.open('slime_hunt')).toBe(true)
        updateParty({ jobs: [guildQuestFixture({ rewardGold: 36 })] })
        expect(offer.offer.value?.job.rewardGold).toBe(36)
        expect(offer.accept('submitter')).toEqual({
            type: 'guild_accept',
            questId: 'slime_hunt',
            rewardMode: 'submitter',
        })
        expect(offer.accept('submitter')).toBeUndefined()
    } finally {
        stop()
    }
})

it.each([
    { jobs: [] },
    { guildContact: { npcId: 'other', nickname: 'Распорядитель' } },
    { leaderId: 'other' },
    { activeJob: guildQuestFixture() },
])('does not confirm an offer after its eligibility changes', (change) => {
    const { offer, updateParty, stop } = fixture()
    try {
        expect(offer.open('slime_hunt')).toBe(true)
        updateParty(change)
        expect(offer.offer.value).toBeUndefined()
        updateParty({})
        expect(offer.accept('party_equal')).toBeUndefined()
    } finally {
        stop()
    }
})
