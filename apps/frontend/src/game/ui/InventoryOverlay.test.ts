import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import { adventureFixture, characterFixture } from '../testing/characterFixture'
import InventoryOverlay from './InventoryOverlay.vue'

const player = () =>
    characterFixture('self', { inventory: [{ instanceId: 'food', itemId: 'food' }] })
describe('inventory items and material stacks', () => {
    it('shows ten herbs in two occupied slots, separate wood items and no duplicate materials wallet', async () => {
        const character = characterFixture('self', {
            inventory: [
                { instanceId: 'herbs-9', itemId: 'herbs', quantity: 9 },
                { instanceId: 'herbs-1', itemId: 'herbs' },
                { instanceId: 'wood-a', itemId: 'wood' },
                { instanceId: 'wood-b', itemId: 'wood' },
                { instanceId: 'grain-9', itemId: 'grain', quantity: 9 },
            ],
        })
        const materials = { ...adventureFixture().materials, herbs: 10, wood: 2, grain: 9 }
        const wrapper = mount(InventoryOverlay, {
            props: { character, chests: [], materials },
            attachTo: document.body,
        })
        try {
            await flushPromises()
            expect(wrapper.get('[aria-label="Занято слотов"]').text()).toBe('5 / 50')
            expect(wrapper.findAll('.inventory-slot[data-filled="true"]')).toHaveLength(5)
            expect(wrapper.findAll('.inventory-slot[aria-label="Древесина"]')).toHaveLength(2)
            expect(wrapper.findAll('.item-quantity').map((badge) => badge.text())).toEqual([
                '9',
                '9',
            ])
            expect(wrapper.find('.inventory-materials').exists()).toBe(false)
            const herbs = wrapper.get('.inventory-slot[title="Лечебные травы × 9"]')
            await herbs.trigger('click')
            expect(wrapper.get('.inventory-actions strong').text()).toBe('Лечебные травы × 9')
            expect(wrapper.get('.inventory-actions small').text()).toBe('До 9 в одном слоте')
            await wrapper.get('.inventory-actions button').trigger('click')
            expect(wrapper.emitted('inventoryAction')).toEqual([
                [{ action: 'drop', itemInstanceId: 'herbs-9' }],
            ])
        } finally {
            wrapper.unmount()
        }
    })
    it('shows a real heart with its quest description and only ordinary transfer actions', async () => {
        const character = characterFixture('self', {
            inventory: [{ instanceId: 'picked-heart', itemId: 'slime_heart' }],
        })
        const wrapper = mount(InventoryOverlay, {
            props: { character, chests: [] },
            attachTo: document.body,
        })
        try {
            await flushPromises()
            const slot = wrapper.get('[aria-label="Слизневое сердце"]')
            expect(slot.get('img').attributes('src')).toBe('/game/assets/items/slime-heart.svg')
            await slot.trigger('click')
            expect(wrapper.get('.inventory-item-description').text()).toContain('Мире')
            const actions = wrapper.findAll('.inventory-actions button')
            expect(actions.map((button) => button.text())).toEqual(['Drop'])
            await actions[0]!.trigger('click')
            expect(wrapper.emitted('inventoryAction')).toEqual([
                [{ action: 'drop', itemInstanceId: 'picked-heart' }],
            ])
        } finally {
            wrapper.unmount()
        }
    })
})

describe('inventory quick-slot assignment', () => {
    it('assigns the selected apple with physical Shift+4 without eating, closing or leaking input', async () => {
        const worldKey = vi.fn<(event: KeyboardEvent) => void>()
        window.addEventListener('keydown', worldKey)
        const wrapper = mount(InventoryOverlay, {
            props: { character: player(), chests: [] },
            attachTo: document.body,
        })
        try {
            await flushPromises()
            await wrapper.get('.inventory-slot[data-filled="true"]').trigger('click')
            await flushPromises()
            const eat = wrapper.get('.inventory-actions button')
            const focused = document.activeElement
            await eat.trigger('keydown', { code: 'Digit4', key: '$', shiftKey: true })
            expect(wrapper.emitted('assignHotbar')).toEqual([[{ slot: 3, itemId: 'food' }]])
            expect(wrapper.get('[role="status"]').text()).toContain('Яблоко назначено в слот 4')
            expect(document.activeElement).toBe(focused)
            for (const modifiers of [
                { repeat: true },
                { ctrlKey: true },
                { metaKey: true },
                { altKey: true },
            ]) {
                await eat.trigger('keydown', { code: 'Digit4', shiftKey: true, ...modifiers })
            }
            await eat.trigger('keydown', { code: 'Digit4' })
            expect(wrapper.emitted('assignHotbar')).toHaveLength(1)
            expect(wrapper.emitted('inventoryAction')).toBeUndefined()
            expect(wrapper.emitted('close')).toBeUndefined()
            expect(worldKey).not.toHaveBeenCalled()
            await wrapper.get('[aria-label="Назначить яблоко в слот 2"]').trigger('click')
            expect(wrapper.emitted('assignHotbar')?.[1]).toEqual([{ slot: 1, itemId: 'food' }])
            await wrapper.setProps({ character: characterFixture('self') })
            await wrapper.trigger('keydown', { code: 'Digit4', shiftKey: true })
            expect(wrapper.emitted('assignHotbar')).toHaveLength(2)
        } finally {
            wrapper.unmount()
            window.removeEventListener('keydown', worldKey)
        }
    })
    it('does not assign an empty or non-food selection', async () => {
        const wrapper = mount(InventoryOverlay, {
            props: {
                character: characterFixture('self', {
                    inventory: [{ instanceId: 'wood', itemId: 'wood' }],
                }),
                chests: [],
            },
        })
        try {
            await wrapper.trigger('keydown', { code: 'Digit4', shiftKey: true })
            await wrapper.get('.inventory-slot[data-filled="true"]').trigger('click')
            await wrapper.trigger('keydown', { code: 'Digit4', shiftKey: true })
            expect(wrapper.find('.inventory-hotbar-slots').exists()).toBe(false)
            expect(wrapper.emitted('assignHotbar')).toBeUndefined()
        } finally {
            wrapper.unmount()
        }
    })
})

describe('standalone inventory keyboard ownership', () => {
    it('keeps a plain header focused and closes with Escape even if focus was lost to the page', async () => {
        const wrapper = mount(InventoryOverlay, {
            props: { character: player(), chests: [] },
            attachTo: document.body,
        })
        try {
            await flushPromises()
            await wrapper.get('h2').trigger('pointerdown')
            expect(document.activeElement).toBe(wrapper.element)
            document.body.tabIndex = -1
            document.body.focus()
            document.body.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
            )
            expect(wrapper.emitted('close')).toHaveLength(1)
        } finally {
            wrapper.unmount()
            document.body.removeAttribute('tabindex')
        }
        const event = new KeyboardEvent('keydown', {
            code: 'Escape',
            bubbles: true,
            cancelable: true,
        })
        window.dispatchEvent(event)
        expect(event.defaultPrevented).toBe(false)
    })
    it('does not steal Escape from another dialog or input', async () => {
        const wrapper = mount(InventoryOverlay, {
            props: { character: player(), chests: [] },
            attachTo: document.body,
        })
        const other = document.createElement('section')
        other.setAttribute('role', 'dialog')
        const button = document.createElement('button')
        other.append(button)
        document.body.append(other)
        try {
            await flushPromises()
            button.focus()
            const event = new KeyboardEvent('keydown', {
                code: 'Escape',
                bubbles: true,
                cancelable: true,
            })
            button.dispatchEvent(event)
            expect(wrapper.emitted('close')).toBeUndefined()
            expect(event.defaultPrevented).toBe(false)
        } finally {
            other.remove()
            wrapper.unmount()
        }
    })
    it('uses F to select a slot and perform its action, ignoring repeat and blocking world shortcuts', async () => {
        const worldKey = vi.fn<(event: KeyboardEvent) => void>()
        window.addEventListener('keydown', worldKey)
        const wrapper = mount(InventoryOverlay, {
            props: { character: player(), chests: [] },
            attachTo: document.body,
        })
        try {
            await flushPromises()
            const slot = wrapper.get<HTMLButtonElement>('.inventory-slot[data-filled="true"]')
            slot.element.focus()
            await slot.trigger('keydown', { code: 'KeyF', key: 'а' })
            await flushPromises()
            const eat = wrapper.get<HTMLButtonElement>('.inventory-actions button')
            expect(document.activeElement).toBe(eat.element)
            await eat.trigger('keydown', { code: 'KeyF', repeat: true })
            expect(wrapper.emitted('inventoryAction')).toBeUndefined()
            await eat.trigger('keydown', { code: 'KeyF' })
            expect(wrapper.emitted('inventoryAction')).toEqual([
                [{ action: 'eat', itemInstanceId: 'food' }],
            ])
            await eat.trigger('keydown', { code: 'KeyQ' })
            expect(worldKey).not.toHaveBeenCalled()
        } finally {
            wrapper.unmount()
            window.removeEventListener('keydown', worldKey)
        }
    })
})
