import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { adventureFixture } from '../testing/characterFixture'
import { guildQuestFixture, workRequestFixture } from '../testing/questFixture'
import AdventureJournal from './AdventureJournal.vue'

describe('physical quest deliveries', () => {
    it('counts only bag hearts and explains trading and chat turn-in', () => {
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
            expect(wrapper.text()).not.toContain('Личных побед')
            expect(wrapper.text()).toContain('полученные через обмен')
            expect(wrapper.text()).toContain('скажите Мире в чате')
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
            expect(wrapper.text()).toContain('подойти к нему внутри часовни и пробудить')
            await wrapper.setProps({ adventure: { ...adventure, wardRestored: true } })
            expect(wrapper.text()).not.toContain('Последний шаг')
            expect(wrapper.text()).toContain('Городские мастерские и торговля работают')
        } finally {
            wrapper.unmount()
        }
    })
    it('shows how to turn in a delivery that was completed in advance', () => {
        const adventure = { ...adventureFixture(), trophies: 3 }
        const wrapper = mount(AdventureJournal, { props: { adventure } })
        try {
            expect(wrapper.text()).toContain('сердца, найденные заранее')
            expect(wrapper.text()).toContain('Хочу сдать Сердца для колокола памяти')
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

describe('city-wide completed orders', () => {
    it('closes a competing city order without claiming a personal payout or consuming the bag', () => {
        const adventure = adventureFixture()
        adventure.quest = {
            ...adventure.quest,
            status: 'cancelled',
            accepted: true,
            notice: 'Городской заказ уже выполнен. Вещи не израсходованы, награда не начислена.',
        }
        adventure.trophies = 3
        adventure.cityState = { locationId: 'map-2-2', bellState: 'prepared' }
        const wrapper = mount(AdventureJournal, { props: { adventure } })
        try {
            expect(wrapper.text()).toContain('Городской заказ уже выполнен')
            expect(wrapper.text()).toContain('награда не начислена')
            expect(wrapper.text()).toContain('внутри часовни')
            expect(wrapper.find('progress').exists()).toBe(false)
            expect(wrapper.find('.journal-hearts').exists()).toBe(false)
            expect(wrapper.text()).not.toContain('Награда выдана')
            expect(wrapper.text()).not.toContain('Общая награда')
        } finally {
            wrapper.unmount()
        }
    })
})
