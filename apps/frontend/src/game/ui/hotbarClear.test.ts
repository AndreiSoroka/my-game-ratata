import { flushPromises, mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import { characterFixture } from '../testing/characterFixture'
import ActionHotbar from './ActionHotbar.vue'

it('clears food and prayer bindings without using them and safely returns keyboard focus', async () => {
    const player = characterFixture('self', {
        inventory: [{ instanceId: 'apple', itemId: 'food' }],
        abilities: { known: ['pray'], cooldowns: {}, casting: null, barrier: null },
    })
    const wrapper = mount(ActionHotbar, {
        props: { player, characters: [player], blocked: false },
        attachTo: document.body,
    })
    try {
        wrapper.vm.assignItem(3, 'food')
        await wrapper.vm.edit(0)
        await wrapper.get('.hotbar-picker button').trigger('click')
        expect(wrapper.findAll('.hotbar-clear')).toHaveLength(2)
        expect(wrapper.get('.hotbar-slot').attributes('aria-label')).toContain('1: Молитва')
        await wrapper.setProps({ blocked: true })
        await wrapper.get('[aria-label="Очистить слот 4"]').trigger('click')
        await flushPromises()
        const fourth = wrapper.findAll<HTMLButtonElement>('.hotbar-slot')[3]!
        expect(fourth.attributes('aria-label')).toContain('4: Пусто')
        expect(document.activeElement).toBe(fourth.element)
        expect(wrapper.findAll('.hotbar-clear')).toHaveLength(1)
        expect(wrapper.get('.hotbar-slot').attributes('aria-label')).toContain('1: Молитва')
        await wrapper.setProps({ blocked: false })
        await fourth.trigger('keydown', { code: 'Enter', repeat: true })
        expect(wrapper.find('.hotbar-picker').exists()).toBe(false)
        const clearPrayer = wrapper.get<HTMLButtonElement>('[aria-label="Очистить слот 1"]')
        clearPrayer.element.focus()
        await clearPrayer.trigger('keydown', { code: 'Space', key: ' ' })
        await flushPromises()
        expect(wrapper.find('.hotbar-clear').exists()).toBe(false)
        expect(wrapper.get('.hotbar-slot').attributes('aria-label')).toContain('1: Пусто')
        expect(document.activeElement).toBe(wrapper.get('.hotbar-slot').element)
        expect(wrapper.emitted('command')).toBeUndefined()
        expect(player.inventory).toEqual([{ instanceId: 'apple', itemId: 'food' }])
    } finally {
        wrapper.unmount()
    }
})
