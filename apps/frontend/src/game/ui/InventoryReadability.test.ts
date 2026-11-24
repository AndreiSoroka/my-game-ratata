import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { ItemCondition } from '@/entities/items'

import { characterFixture } from '../testing/characterFixture'
import InventoryOverlay from './InventoryOverlay.vue'
describe('inventory gold and condition', () => {
    it('shows zero gold, a readable equipped condition and updates from snapshots', async () => {
        const character = characterFixture('self', {
            equipment: { weapon: { itemId: 'simple_sword', instanceId: 'blade', durability: 97 } },
        })
        const wrapper = mount(InventoryOverlay, { props: { character, chests: [], gold: 0 } })
        expect(wrapper.get('[aria-label="Золото"]').text()).toContain('Золото: 0')
        expect(wrapper.text()).toContain('Прочность: 49% · 97 / 200')
        await wrapper.setProps({
            gold: 123,
            character: {
                ...character,
                equipment: {
                    weapon: { itemId: 'simple_sword', instanceId: 'blade', durability: 0 },
                },
            },
        })
        expect(wrapper.get('[aria-label="Золото"]').text()).toContain('123')
        expect(wrapper.text()).toContain('Сломано — нужен ремонт')
        wrapper.unmount()
    })
    it('shows the condition of a keyboard-focused bag item without moving focus', async () => {
        const character = characterFixture('self', {
            inventory: [{ itemId: 'axe', instanceId: 'axe', durability: 850 }],
        })
        const wrapper = mount(InventoryOverlay, {
            props: { character, chests: [], gold: 7 },
            attachTo: document.body,
        })
        const slot = wrapper.get<HTMLButtonElement>('.inventory-slot[data-filled="true"]')
        slot.element.focus()
        await slot.trigger('focus')
        expect(wrapper.get('.inventory-inspection').text()).toContain('Прочность: 85% · 850 / 1000')
        expect(document.activeElement).toBe(slot.element)
        expect(wrapper.emitted('inventoryAction')).toBeUndefined()
        wrapper.unmount()
    })
    it('does not invent condition for materials', () => {
        const wrapper = mount(ItemCondition, {
            props: { item: { itemId: 'wood', instanceId: 'log' } },
        })
        expect(wrapper.find('meter').exists()).toBe(false)
        wrapper.unmount()
    })
})
