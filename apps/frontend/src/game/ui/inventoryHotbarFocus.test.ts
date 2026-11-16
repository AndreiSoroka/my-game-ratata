import { flushPromises, mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import { characterFixture } from '../testing/characterFixture'
import InventoryOverlay from './InventoryOverlay.vue'

it('assigns the focused apple before Enter and never substitutes a previously selected apple for another focused slot', async () => {
    const wrapper = mount(InventoryOverlay, {
        props: {
            character: characterFixture('self', {
                inventory: [
                    { instanceId: 'apple', itemId: 'food' },
                    { instanceId: 'wood', itemId: 'wood' },
                ],
            }),
            chests: [],
        },
        attachTo: document.body,
    })
    try {
        await flushPromises()
        const apple = wrapper.get<HTMLButtonElement>('[data-item-instance-id="apple"]')
        const wood = wrapper.get<HTMLButtonElement>('[data-item-instance-id="wood"]')
        expect(document.activeElement).toBe(apple.element)
        expect(wrapper.find('.inventory-actions').exists()).toBe(false)
        await apple.trigger('keydown', { code: 'Digit4', key: '$', shiftKey: true })
        expect(wrapper.emitted('assignHotbar')).toEqual([[{ slot: 3, itemId: 'food' }]])
        expect(wrapper.get('[role="status"]').text()).toContain('Яблоко назначено в слот 4')
        expect(document.activeElement).toBe(apple.element)
        expect(wrapper.find('.inventory-actions').exists()).toBe(false)
        await apple.trigger('keydown', { code: 'Digit4', shiftKey: true, repeat: true })
        await apple.trigger('keydown', { code: 'ArrowRight' })
        expect(document.activeElement).toBe(wood.element)
        await wood.trigger('keydown', { code: 'Digit4', shiftKey: true })
        expect(wrapper.emitted('assignHotbar')).toHaveLength(1)

        await apple.trigger('click')
        await flushPromises()
        expect(wrapper.find('.inventory-actions').exists()).toBe(true)
        wood.element.focus()
        await wood.trigger('keydown', { code: 'Digit4', shiftKey: true })
        const empty = wrapper.get<HTMLButtonElement>('[aria-label="Empty slot 3"]')
        empty.element.focus()
        await empty.trigger('keydown', { code: 'Digit4', shiftKey: true })
        expect(wrapper.emitted('assignHotbar')).toHaveLength(1)
        expect(wrapper.emitted('inventoryAction')).toBeUndefined()
        expect(wrapper.emitted('close')).toBeUndefined()
    } finally {
        wrapper.unmount()
    }
})
