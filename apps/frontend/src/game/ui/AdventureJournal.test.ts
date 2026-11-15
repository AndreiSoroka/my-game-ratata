import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { adventureFixture } from '../testing/characterFixture'
import { guildQuestFixture, workRequestFixture } from '../testing/questFixture'
import AdventureJournal from './AdventureJournal.vue'

describe('physical quest deliveries', () => {
    it('counts bag hearts instead of kills and explains collection and delivery', () => {
        const adventure = adventureFixture()
        adventure.quest = {
            ...adventure.quest,
            kills: 7,
            goal: 3,
            status: 'active',
            requiredItemId: 'slime_heart',
        }
        adventure.trophies = 1
        const wrapper = mount(AdventureJournal, { props: { adventure } })
        try {
            expect(wrapper.get('progress').attributes('value')).toBe('1')
            expect(wrapper.get('progress').attributes('max')).toBe('3')
            expect(wrapper.get('.journal-hearts').text()).toContain('1 / 3')
            expect(wrapper.get('.journal-statistic').text()).toContain('7')
            expect(wrapper.text()).toContain('подойдите к телу слизня')
            expect(wrapper.text()).toContain('заберите сердце из окна добычи в рюкзак')
            expect(wrapper.text()).toContain('здание гильдии Новогорода')
            expect(wrapper.text()).toContain('В счётчик входят только сердца в вашем рюкзаке')
            expect(wrapper.get('img').attributes('alt')).toBe('Слизневое сердце')
        } finally {
            wrapper.unmount()
        }
    })
    it('keeps a finished delivery completed after its items have been consumed and shows the final bell step', async () => {
        const adventure = adventureFixture()
        adventure.quest = {
            ...adventure.quest,
            kills: 3,
            status: 'completed',
            rewardMode: 'party_equal',
            rewardShares: [
                { characterId: 'self', gold: 20 },
                { characterId: 'other', gold: 20 },
            ],
        }
        adventure.trophies = 0
        const wrapper = mount(AdventureJournal, { props: { adventure, playerId: 'self' } })
        try {
            expect(wrapper.find('progress').exists()).toBe(false)
            expect(wrapper.text()).toContain('Мира получила 3 сердца')
            expect(wrapper.text()).toContain('Общая награда: 40 золотых')
            expect(wrapper.text()).toContain('Получено вами: 20 золотых')
            expect(wrapper.text()).toContain('Восстановить колокол памяти')
            await wrapper.setProps({ adventure: { ...adventure, wardRestored: true } })
            expect(wrapper.text()).not.toContain('Последний шаг')
            expect(wrapper.text()).toContain('Пограничный колокол вновь защищает долину')
        } finally {
            wrapper.unmount()
        }
    })
    it('explains that already collected hearts do not replace accepting the quest', () => {
        const adventure = { ...adventureFixture(), trophies: 3 }
        const wrapper = mount(AdventureJournal, { props: { adventure } })
        try {
            expect(wrapper.text()).toContain('Поговорите с Мирой, чтобы принять задание')
            expect(wrapper.text()).toContain('Сердца можно собрать заранее')
            expect(wrapper.text()).not.toContain('Награда выдана')
        } finally {
            wrapper.unmount()
        }
    })
    it('includes the current worker request and permits its leader to abandon away from the clerk', async () => {
        const wrapper = mount(AdventureJournal, {
            props: {
                adventure: adventureFixture(),
                playerId: 'self',
                alive: true,
                party: {
                    partyId: null,
                    leaderId: null,
                    members: [],
                    invitations: [],
                    jobs: [],
                    notice: null,
                    activeJob: guildQuestFixture({
                        workRequest: workRequestFixture({
                            stage: 'returning',
                            proofAccepted: true,
                        }),
                        rewardMode: 'submitter',
                    }),
                },
            },
        })
        try {
            expect(wrapper.text()).toContain('Фермер Агафья')
            expect(wrapper.text()).toContain('Работник возвращается к распорядителю')
            expect(wrapper.text()).toContain('Вся награда сдающему')
            expect(wrapper.find('input[type="radio"]').exists()).toBe(false)
            const abandon = wrapper.get('.quest-card-actions button')
            expect(abandon.attributes('disabled')).toBeUndefined()
            await abandon.trigger('click')
            expect(wrapper.emitted('command')).toEqual([
                [{ type: 'guild_abandon', instanceId: 'guild-contract-1' }],
            ])
        } finally {
            wrapper.unmount()
        }
    })
})
