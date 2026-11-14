import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { characterFixture } from '../testing/characterFixture'
import ActionHotbar from './ActionHotbar.vue'

describe('four explicit hotbar bindings', () => {
    it('accepts an inventory assignment while blocked but does not consume food or move focus', async () => {
        const player = characterFixture('self', {
            inventory: [{ instanceId: 'apple-1', itemId: 'food' }],
        })
        const wrapper = mount(ActionHotbar, {
            props: { player, characters: [player], blocked: true },
        })
        try {
            const focused = document.activeElement
            wrapper.vm.assignItem(3, 'food')
            await wrapper.vm.$nextTick()
            expect(wrapper.findAll('.hotbar-slot')[3]!.attributes('aria-label')).toContain(
                '4: Яблоко'
            )
            expect(wrapper.get('.hotbar-slot small').text()).toBe('1')
            expect(wrapper.find('.hotbar-picker').exists()).toBe(false)
            expect(document.activeElement).toBe(focused)
            wrapper.vm.activate(3)
            expect(wrapper.emitted('command')).toBeUndefined()
            expect(wrapper.emitted('cancel')).toBeUndefined()
            wrapper.vm.assignItem(4, 'food')
            wrapper.vm.assignItem(-1, 'food')
            await wrapper.vm.$nextTick()
            expect(wrapper.findAll('.hotbar-slot')).toHaveLength(4)
            await wrapper.setProps({ blocked: false })
            wrapper.vm.activate(3)
            expect(wrapper.emitted('command')).toEqual([
                [{ type: 'inventory_action', action: 'eat', itemInstanceId: 'apple-1' }],
            ])
            await wrapper.setProps({ player: { ...player, inventory: [] } })
            wrapper.vm.assignItem(0, 'food')
            await wrapper.vm.$nextTick()
            expect(wrapper.findAll('.hotbar-slot')[0]!.attributes('aria-label')).toContain(
                '1: Базовая атака'
            )
            expect(wrapper.get('.hotbar-slot small').text()).toBe('0')
        } finally {
            wrapper.unmount()
        }
    })
    it('starts with its basic action, binds food by type, consumes a real instance, keeps a zero count and resets on new identity', async () => {
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
            health: { kind: 'exact', current: 5, max: 24 },
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
