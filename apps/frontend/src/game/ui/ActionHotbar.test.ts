import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { characterFixture } from '../testing/characterFixture'
import ActionHotbar from './ActionHotbar.vue'

describe('four explicit hotbar bindings', () => {
    it('starts empty, binds food by type, consumes a real instance, keeps a zero count and resets on new identity', async () => {
        const player = characterFixture('self', {
            inventory: [{ instanceId: 'apple-1', itemId: 'food', quantity: 1 }],
        })
        const wrapper = mount(ActionHotbar, {
            props: { player, characters: [player], blocked: false },
        })
        try {
            expect(wrapper.findAll('.hotbar-slot')).toHaveLength(4)
            expect(wrapper.findAll('.hotbar-slot small')).toHaveLength(0)
            await wrapper.vm.edit(3)
            await flushPromises()
            await wrapper
                .findAll('.hotbar-picker button')
                .find((button) => button.text().startsWith('Яблоко'))!
                .trigger('click')
            wrapper.vm.activate(3)
            expect(wrapper.emitted('command')).toEqual([
                [{ type: 'inventory_action', action: 'eat', itemInstanceId: 'apple-1' }],
            ])
            const appleImage = wrapper.get('.hotbar-item').attributes('src')
            await wrapper.setProps({ player: { ...player, inventory: [] } })
            expect(wrapper.get('.hotbar-slot small').text()).toBe('0')
            expect(wrapper.get('.hotbar-item').attributes('src')).toBe(appleImage)
            wrapper.vm.activate(3)
            expect(wrapper.emitted('command')).toHaveLength(1)
            await wrapper.setProps({ player: characterFixture('new-life') })
            expect(wrapper.find('.hotbar-slot small').exists()).toBe(false)
        } finally {
            wrapper.unmount()
        }
    })
    it('shows pinned prayer cost before pressing its key and submits that exact intent', async () => {
        const player = characterFixture('self', {
            hp: 5,
            abilities: { known: ['pray'], cooldowns: {}, casting: null, barrier: null },
        })
        const wrapper = mount(ActionHotbar, {
            props: { player, characters: [player], blocked: false },
        })
        try {
            await wrapper.vm.edit(0)
            await wrapper.get('.hotbar-picker button').trigger('click')
            expect(wrapper.get('.prayer-preview').text()).toBe('Восстановить self · 5 MP')
            wrapper.vm.activate(0)
            expect(wrapper.emitted('command')).toEqual([
                [
                    {
                        type: 'use_ability',
                        abilityId: 'pray',
                        intent: { mode: 'restore', targetId: player.id },
                    },
                ],
            ])
        } finally {
            wrapper.unmount()
        }
    })
    it('closes its assignment picker with Escape after a background click', async () => {
        const player = characterFixture('self')
        const wrapper = mount(ActionHotbar, {
            props: { player, characters: [player], blocked: false },
            attachTo: document.body,
        })
        try {
            await wrapper.vm.edit(0)
            expect(wrapper.find('.hotbar-picker').exists()).toBe(true)
            ;(document.activeElement as HTMLElement).blur()
            document.body.dispatchEvent(
                new KeyboardEvent('keydown', { code: 'Escape', bubbles: true })
            )
            await wrapper.vm.$nextTick()
            expect(wrapper.find('.hotbar-picker').exists()).toBe(false)
        } finally {
            wrapper.unmount()
        }
    })
})
