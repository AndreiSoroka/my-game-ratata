import type { NpcQuestSnapshot } from '@my-game-ratata/contracts'
import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import { adventureFixture, characterFixture, worldFixture } from '../testing/characterFixture'
import { guildQuestFixture, workRequestFixture } from '../testing/questFixture'
import { activeQuests } from './activeQuests'
import CharacterQuests from './CharacterQuests.vue'
import { questOfferFixture } from './socialFixtures'

function npcQuest(status: NpcQuestSnapshot['status']): NpcQuestSnapshot {
    return {
        ...questOfferFixture(),
        instanceId: 'npc-contract-1',
        progress: [3],
        status,
        notice: null,
    }
}
it('lists accepted unfinished quests from all sources and removes completed, cancelled and merely offered jobs', () => {
    const world = worldFixture([])
    const snapshot = {
        ...world,
        adventure: {
            ...adventureFixture(),
            quest: { ...adventureFixture().quest, status: 'ready' as const },
        },
        party: { ...world.party!, activeJob: guildQuestFixture({ status: 'reward_missing' }) },
        social: { quest: npcQuest('active'), questOffer: questOfferFixture() },
    }
    expect(activeQuests(snapshot).map((entry) => entry.source)).toEqual(['story', 'guild', 'npc'])
    expect(
        activeQuests({
            ...snapshot,
            adventure: {
                ...snapshot.adventure,
                quest: { ...snapshot.adventure.quest, status: 'available' },
            },
            party: { ...snapshot.party, activeJob: guildQuestFixture({ status: 'completed' }) },
            social: { quest: npcQuest('completed'), questOffer: questOfferFixture() },
        })
    ).toEqual([])
    expect(
        activeQuests({
            ...snapshot,
            adventure: undefined,
            party: {
                ...snapshot.party,
                activeJob: guildQuestFixture({
                    workRequest: workRequestFixture({ stage: 'cancelled' }),
                }),
            },
            social: { quest: npcQuest('cancelled') },
        })
    ).toEqual([])
})
it('reads details and allows abandonment without offering direct hand-in commands', async () => {
    const player = characterFixture('self')
    const snapshot = { ...worldFixture([player]), social: { quest: npcQuest('ready') } }
    const view = mount(CharacterQuests, { props: { snapshot, player, characters: [] } })
    try {
        expect(view.text()).toContain('Готово к сдаче')
        expect(view.text()).toContain('скажите «квест готов»')
        expect(view.findAll('button').some((button) => button.text() === 'Сдать')).toBe(false)
        await view.get('.quest-detail button').trigger('click')
        expect(view.emitted('command')).toEqual([
            [{ type: 'npc_quest_abandon', instanceId: 'npc-contract-1' }],
        ])
        await view.setProps({ snapshot: { ...snapshot, social: { quest: null } } })
        expect(view.text()).toBe('Активных квестов нет.')
    } finally {
        view.unmount()
    }
})
