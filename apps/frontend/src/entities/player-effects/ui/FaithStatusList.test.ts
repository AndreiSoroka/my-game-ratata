import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import FaithStatusList from './FaithStatusList.vue'

it('displays patrons in descending level order without mutating the input', async () => {
    const patrons = [
        { id: 'grave', name: 'Хранитель Праха' },
        { id: 'road', name: 'Безымянный Путник', level: 2, mood: 'wrathful' },
        { id: 'hearth', name: 'Угольная Мать', level: 6, mood: 'benevolent' },
        { id: 'lantern', name: 'Слепой Архивариус', level: 0, mood: 'neutral' },
    ] as const
    const wrapper = mount(FaithStatusList, { props: { patrons } })
    const rows = wrapper.findAll('.faith-status')
    expect(
        rows.map((row) => ({
            name: row.get('.faith-status__patron').text(),
            mood: row.element.querySelector('[data-patron-mood]')?.getAttribute('data-patron-mood'),
        }))
    ).toEqual([
        { name: 'Угольная Мать', mood: 'benevolent' },
        { name: 'Безымянный Путник', mood: 'wrathful' },
        { name: 'Хранитель Праха', mood: undefined },
        { name: 'Слепой Архивариус', mood: 'neutral' },
    ])
    expect(rows[2]?.get('.faith-status__progress').text()).toMatch(/\b0$/)
    expect(patrons.map(({ id }) => id)).toEqual(['grave', 'road', 'hearth', 'lantern'])
    expect(wrapper.findAll('[data-fantasy-divider="divider-002"]')).toHaveLength(1)

    await wrapper.setProps({ patrons: [] })

    expect(wrapper.find('.faith-status-list').exists()).toBe(false)
    expect(wrapper.find('[data-fantasy-divider="divider-002"]').exists()).toBe(false)
    wrapper.unmount()
})
