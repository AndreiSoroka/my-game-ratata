import type { GuildQuestSnapshot, PartySnapshot } from '@my-game-ratata/contracts'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { characterFixture } from '../testing/characterFixture'
import GuildWindow from './GuildWindow.vue'

const job: GuildQuestSnapshot = {
    id: 'slime_hunt',
    title: 'Зачистка троп',
    description: 'Победите трёх слизней.',
    goal: 3,
    rewardGold: 30,
    progress: 2,
    status: 'active',
    participants: [
        { id: 'early', nickname: 'Ранний', eligible: true, contribution: 0 },
        { id: 'late', nickname: 'Поздний', eligible: false, contribution: 0 },
    ],
}
function party(activeJob: GuildQuestSnapshot): PartySnapshot {
    return {
        partyId: null,
        leaderId: null,
        members: [],
        invitations: [],
        jobs: [],
        activeJob,
        notice: null,
    }
}
describe('guild task instructions', () => {
    it('distinguishes counted victories from heart delivery and permanent late-join reward ineligibility', () => {
        const wrapper = mount(GuildWindow, {
            props: { player: characterFixture('self'), characters: [], party: party(job) },
        })
        try {
            expect(wrapper.get('label').text()).toContain('Побеждено враждебных слизней: 2 / 3')
            expect(wrapper.text()).toContain('Сердца и другие предметы сдавать не нужно')
            const participants = wrapper.findAll('.guild-contributions li')
            expect(participants[0]?.text()).toContain('Нужен личный вклад')
            expect(participants[1]?.text()).toContain('Без награды за этот контракт')
            expect(wrapper.text()).not.toContain('Без права на награду пока')
        } finally {
            wrapper.unmount()
        }
    })
    it('labels exploration as visited lands and requests the ordinary reward command near a clerk', async () => {
        const activeJob: GuildQuestSnapshot = {
            ...job,
            id: 'survey_frontier',
            status: 'ready',
            progress: 3,
        }
        const clerk = characterFixture('npc_friendly_girl_1', { controllerKind: 'scripted' })
        const wrapper = mount(GuildWindow, {
            props: {
                player: characterFixture('self'),
                characters: [clerk],
                party: party(activeJob),
            },
        })
        try {
            expect(wrapper.get('label').text()).toContain('Исследовано разных земель: 3 / 3')
            expect(wrapper.text()).toContain('Каждый участник должен сам выйти в разведку')
            expect(wrapper.text()).not.toContain('Сердца и другие предметы')
            expect(wrapper.findAll('.guild-contributions li')[0]?.text()).toContain(
                'Без награды: нет личного вклада'
            )
            await wrapper.get('.guild-reward button').trigger('click')
            expect(wrapper.emitted('command')).toEqual([[{ type: 'guild_turn_in' }]])
        } finally {
            wrapper.unmount()
        }
    })
})
