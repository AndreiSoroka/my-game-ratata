import type { NpcQuestSnapshot } from '@my-game-ratata/contracts'
import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import { adventureFixture, characterFixture, worldFixture } from '@/game/testing/characterFixture'
import { guildQuestFixture, workRequestFixture } from '@/game/testing/questFixture'
import { questOfferFixture } from '@/game/testing/socialFixtures'

import { activeQuests } from '../model/activeQuests'
import CharacterQuests from './CharacterQuests.vue'

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
        party: {
            ...world.party!,
            activeJobs: [
                guildQuestFixture({ status: 'reward_missing' }),
                guildQuestFixture({ instanceId: 'guild-2' }),
            ],
        },
        social: { quests: [npcQuest('active')], questOffer: questOfferFixture() },
    }
    expect(activeQuests(snapshot).map((entry) => entry.source)).toEqual([
        'story',
        'guild',
        'guild',
        'npc',
    ])
    expect(
        activeQuests({
            ...snapshot,
            adventure: {
                ...snapshot.adventure,
                quest: { ...snapshot.adventure.quest, status: 'available' },
            },
            party: { ...snapshot.party, activeJobs: [guildQuestFixture({ status: 'completed' })] },
            social: { quests: [npcQuest('completed')], questOffer: questOfferFixture() },
        })
    ).toEqual([])
    expect(
        activeQuests({
            ...snapshot,
            adventure: undefined,
            party: {
                ...snapshot.party,
                activeJobs: [
                    guildQuestFixture({
                        workRequest: workRequestFixture({ stage: 'cancelled' }),
                    }),
                ],
            },
            social: { quests: [npcQuest('cancelled')] },
        })
    ).toEqual([])
})
it('reads details and allows abandonment without offering direct hand-in commands', async () => {
    const player = characterFixture('self')
    const snapshot = { ...worldFixture([player]), social: { quests: [npcQuest('ready')] } }
    const view = mount(CharacterQuests, { props: { snapshot, player, characters: [] } })
    try {
        expect(view.text()).toContain('Готово к сдаче')
        expect(view.text()).toContain('скажите «квест готов»')
        expect(view.findAll('button').some((button) => button.text() === 'Сдать')).toBe(false)
        await view.get('.quest-detail button').trigger('click')
        expect(view.emitted('command')).toEqual([
            [{ type: 'npc_quest_abandon', instanceId: 'npc-contract-1' }],
        ])
        await view.setProps({ snapshot: { ...snapshot, social: { quests: [] } } })
        expect(view.text()).toBe('Активных квестов нет.')
    } finally {
        view.unmount()
    }
})
