import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { adventureFixture } from '../testing/characterFixture'
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
        adventure.quest = { ...adventure.quest, kills: 3, status: 'completed' }
        adventure.trophies = 0
        const wrapper = mount(AdventureJournal, { props: { adventure } })
        try {
            expect(wrapper.find('progress').exists()).toBe(false)
            expect(wrapper.text()).toContain('Мира получила 3 сердца')
            expect(wrapper.text()).toContain('Получено: 40 золотых')
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
})
