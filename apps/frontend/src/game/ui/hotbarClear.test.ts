import { flushPromises, mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import { characterFixture } from '../testing/characterFixture'
import { clickWithPointer } from '../testing/clickWithPointer'
import ActionHotbar from './ActionHotbar.vue'

it('clears food and prayer bindings without using them and safely returns keyboard focus', async () => {
    const player = characterFixture('self', {
        heroClass: 'cleric',
        inventory: [{ instanceId: 'apple', itemId: 'food' }],
        abilities: { known: ['pray'], cooldowns: {}, casting: null, barrier: null },
    })
    const wrapper = mount(ActionHotbar, {
        props: { player, characters: [player], blocked: false },
        attachTo: document.body,
    })
    const canvas = document.createElement('canvas')
    canvas.dataset.gameCanvas = ''
    canvas.tabIndex = 0
    document.body.append(canvas)
    try {
        wrapper.vm.assignItem(3, 'food')
        await flushPromises()
        expect(wrapper.findAll('.hotbar-clear')).toHaveLength(3)
        const prayerSlot = wrapper.findAll<HTMLButtonElement>('.hotbar-slot')[1]!
        expect(prayerSlot.attributes('aria-label')).toContain('2: Молитва')
        await wrapper.setProps({ blocked: true })
        await clickWithPointer(wrapper.get('[aria-label="Очистить слот 4"]').element)
        await flushPromises()
        const fourth = wrapper.findAll<HTMLButtonElement>('.hotbar-slot')[3]!
        expect(fourth.attributes('aria-label')).toContain('4: Пусто')
        expect(document.activeElement).toBe(canvas)
        expect(wrapper.findAll('.hotbar-clear')).toHaveLength(2)
        expect(prayerSlot.attributes('aria-label')).toContain('2: Молитва')
        await wrapper.setProps({ blocked: false })
        await fourth.trigger('keydown', { code: 'Enter', repeat: true })
        expect(wrapper.find('.hotbar-picker').exists()).toBe(false)
        const clearPrayer = wrapper.get<HTMLButtonElement>('[aria-label="Очистить слот 2"]')
        clearPrayer.element.focus()
        await clearPrayer.trigger('keydown', { code: 'Space', key: ' ' })
        clearPrayer.element.click()
        expect(wrapper.find('[aria-label="Очистить слот 2"]').exists()).toBe(true)
        await clickWithPointer(clearPrayer.element)
        await flushPromises()
        expect(wrapper.findAll('.hotbar-clear')).toHaveLength(1)
        await wrapper.setProps({ player: { ...player } })
        expect(prayerSlot.attributes('aria-label')).toContain('2: Пусто')
        expect(document.activeElement).toBe(canvas)
        expect(wrapper.emitted('command')).toBeUndefined()
        expect(player.inventory).toEqual([{ instanceId: 'apple', itemId: 'food' }])
    } finally {
        wrapper.unmount()
        canvas.remove()
    }
})
