import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import PlayerVitalsWidget from './PlayerVitalsWidget.vue'

it('uses percentages independently of exact display values and requires both exact numbers', async () => {
    const wrapper = mount(PlayerVitalsWidget, {
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
    const wrapper = mount(PlayerVitalsWidget, {
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

it('animates segmented HP and energy at the first visible band', async () => {
    const segments = [40, 20, 20, 20]
    const wrapper = mount(PlayerVitalsWidget, {
        props: {
            nickname: 'Путник',
            hpPercent: 40,
            hpSegments: segments,
            manaPercent: 100,
            energyPercent: 60,
            energySegments: segments,
        },
    })
    const health = wrapper.get('[aria-label="Health"]')
    const energy = wrapper.get('[aria-label="Energy"]')
    expect(health.attributes('data-animated')).toBe('true')
    expect(energy.attributes('data-dimmed')).toBe('true')

    await wrapper.setProps({ hpPercent: 60, energyPercent: 40 })
    expect(health.attributes('data-animated')).toBe('false')
    expect(energy.attributes('data-animated')).toBe('true')
    expect(energy.attributes('data-dimmed')).toBe('false')
    wrapper.unmount()
})
