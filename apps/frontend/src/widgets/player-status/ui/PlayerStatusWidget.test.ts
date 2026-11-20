import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import PlayerStatusWidget from './PlayerStatusWidget.vue'

it('uses percentages independently of exact display values and requires both exact numbers', async () => {
    const wrapper = mount(PlayerStatusWidget, {
        props: {
            nickname: 'Путник',
            hpPercent: 30,
            manaPercent: 80,
            energyPercent: 50,
            hpCurrent: 5,
            hpMax: 10,
            manaCurrent: 8,
        },
    })
    const health = wrapper.get('[role="progressbar"][aria-label="Health"]')
    expect(health.attributes('aria-valuenow')).toBe('30')
    expect(health.attributes('aria-valuetext')).toBe('5/10')
    expect(health.text()).toBe('5/10')
    expect(wrapper.findAll('[aria-valuetext]')).toHaveLength(1)
    await wrapper.setProps({ hpMax: undefined })
    expect(health.attributes('aria-valuetext')).toBeUndefined()
    expect(health.text()).toBe('')
    wrapper.unmount()
})

it('animates health below 30 percent and mana and energy below 20 percent', async () => {
    const wrapper = mount(PlayerStatusWidget, {
        props: {
            nickname: 'Путник',
            hpPercent: 30,
            manaPercent: 3,
            energyPercent: 20,
        },
    })
    const animatedBars = () =>
        wrapper.findAll('[data-animated="true"]').map((bar) => bar.attributes('aria-label'))
    const dimmedBars = () =>
        wrapper.findAll('[data-dimmed="true"]').map((bar) => bar.attributes('aria-label'))
    expect(animatedBars()).toEqual(['Mana'])
    expect(dimmedBars()).toEqual([])

    await wrapper.setProps({ hpPercent: 29.9, manaPercent: 20, energyPercent: 5 })
    expect(animatedBars()).toEqual(['Health', 'Energy'])
    expect(dimmedBars()).toEqual([])

    await wrapper.setProps({ energyPercent: 20 })
    expect(animatedBars()).toEqual(['Health'])
    expect(dimmedBars()).toEqual(['Mana', 'Energy'])

    await wrapper.setProps({ hpPercent: 30 })
    expect(animatedBars()).toEqual([])
    expect(dimmedBars()).toEqual([])
    wrapper.unmount()
})
