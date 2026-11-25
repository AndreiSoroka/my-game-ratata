import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import type { UiSoundId } from '@/game/assets/soundCatalog'
import { characterFixture } from '@/game/testing/characterFixture'

import { gameUiSoundKey } from '../model/gameUiSound'
import InventoryOverlay from './InventoryOverlay.vue'

const player = () =>
    characterFixture('self', { inventory: [{ instanceId: 'food', itemId: 'food' }] })

it('plays the cell cue for navigation and selection while initial and restored focus stay silent', async () => {
    const boots = { instanceId: 'boots', itemId: 'boots' } as const
    const food = { instanceId: 'food', itemId: 'food' } as const
    const playUiSound = vi.fn<(id: UiSoundId) => void>()
    const wrapper = mount(InventoryOverlay, {
        props: { character: characterFixture('self', { inventory: [boots, food] }), chests: [] },
        attachTo: document.body,
        global: { provide: { [gameUiSoundKey]: playUiSound } },
    })
    try {
        await flushPromises()
        const bootsSlot = wrapper.get<HTMLButtonElement>('[data-item-instance-id="boots"]')
        const foodSlot = wrapper.get<HTMLButtonElement>('[data-item-instance-id="food"]')
        expect(document.activeElement).toBe(bootsSlot.element)
        expect(playUiSound).not.toHaveBeenCalled()

        await bootsSlot.trigger('keydown', { code: 'ArrowRight' })
        expect(document.activeElement).toBe(foodSlot.element)
        expect(playUiSound.mock.calls).toEqual([['uiSlotSelect']])

        bootsSlot.element.focus()
        await bootsSlot.trigger('keydown', { code: 'Enter' })
        await flushPromises()
        expect(playUiSound.mock.calls).toEqual([['uiSlotSelect'], ['uiSlotSelect']])

        await wrapper.get('.inventory-actions button').trigger('click')
        expect(wrapper.emitted('inventoryAction')).toEqual([
            [{ action: 'equip', itemInstanceId: 'boots' }],
        ])
        await wrapper.setProps({
            character: characterFixture('self', { inventory: [food], equipment: { boots } }),
        })
        await flushPromises()
        expect(document.activeElement).toBe(wrapper.get('[data-item-instance-id="food"]').element)
        expect(playUiSound).toHaveBeenCalledTimes(2)
    } finally {
        wrapper.unmount()
    }
})

describe('inventory items and material stacks', () => {
    it('equips a torch from the bag and unequips it from the independent light slot', async () => {
        const torch = { instanceId: 'torch', itemId: 'torch' } as const
        const wrapper = mount(InventoryOverlay, {
            props: { character: characterFixture('self', { inventory: [torch] }), chests: [] },
            attachTo: document.body,
        })
        try {
            await flushPromises()
            const lightSlot = wrapper.get('[data-equipment-slot="light"]')
            expect(lightSlot.text()).toBe('Свет')
            await wrapper.get('[data-item-instance-id="torch"]').trigger('click')
            expect(wrapper.get('.inventory-item-description').text()).toContain('подземелье')
            await wrapper.get('.inventory-actions button').trigger('click')
            expect(wrapper.emitted('inventoryAction')).toEqual([
                [{ action: 'equip', itemInstanceId: 'torch' }],
            ])
            await wrapper.setProps({
                character: characterFixture('self', { equipment: { light: torch } }),
            })
            expect(lightSlot.get('img').attributes('src')).toBe('/game/assets/items/torch.svg')
            await lightSlot.trigger('click')
            expect(wrapper.emitted('equipmentAction')).toEqual([
                [{ action: 'unequip', slot: 'light' }],
            ])
        } finally {
            wrapper.unmount()
        }
    })

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
        const wrapper = mount(InventoryOverlay, {
            props: { character, chests: [] },
            attachTo: document.body,
        })
        try {
            await flushPromises()
            expect(wrapper.get('[aria-label="Занято слотов"]').text()).toBe('5 / 50')
            expect(wrapper.findAll('.inventory-slot[data-filled="true"]')).toHaveLength(5)
            expect(wrapper.findAll('.inventory-slot[aria-label="Древесина"]')).toHaveLength(2)
            expect(wrapper.findAll('.ui-item-slot__quantity').map((badge) => badge.text())).toEqual(
                ['9', '9']
            )
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
            expect(actions.map((button) => button.text())).toEqual(['Выбросить'])
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

it('navigates the bag and equipment with physical WASD, including after focusing a panel surface', async () => {
    const wrapper = mount(InventoryOverlay, {
        props: { character: player(), chests: [] },
        attachTo: document.body,
    })
    try {
        await flushPromises()
        const slots = wrapper.findAll('.inventory-slot')
        const equipment = wrapper.findAll('.equipment-slot')
        for (const [from, code, key, to] of [
            [0, 'KeyD', 'в', 1],
            [1, 'KeyS', 'ы', 11],
            [11, 'KeyA', 'ф', 10],
            [10, 'KeyW', 'ц', 0],
        ] as const) {
            await slots[from]!.trigger('keydown', { code, key })
            expect(document.activeElement).toBe(slots[to]!.element)
        }
        await slots[0]!.trigger('keydown', { code: 'KeyD', altKey: true })
        expect(document.activeElement).toBe(slots[0]!.element)
        await slots[0]!.trigger('keydown', { code: 'KeyA' })
        expect(document.activeElement).toBe(equipment[0]!.element)
        await equipment[0]!.trigger('keydown', { code: 'KeyS' })
        expect(document.activeElement).toBe(equipment[1]!.element)
        await equipment[1]!.trigger('keydown', { code: 'KeyD' })
        expect(document.activeElement).toBe(slots[10]!.element)
        await wrapper.get('h2').trigger('pointerdown')
        await wrapper.trigger('keydown', { code: 'KeyW' })
        expect(document.activeElement).toBe(slots[0]!.element)
        expect(wrapper.emitted('inventoryAction')).toBeUndefined()
        expect(wrapper.emitted('equipmentAction')).toBeUndefined()
    } finally {
        wrapper.unmount()
    }
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
    it('moves between a slot and its actions, confirms with F and blocks world shortcuts', async () => {
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
            let eat = wrapper.get<HTMLButtonElement>('.inventory-actions button')
            expect(document.activeElement).toBe(eat.element)
            await eat.trigger('keydown', { code: 'KeyW', key: 'ц' })
            expect(document.activeElement).toBe(slot.element)
            expect(wrapper.find('.inventory-actions').exists()).toBe(false)
            await slot.trigger('keydown', { code: 'KeyF', key: 'а' })
            await flushPromises()
            eat = wrapper.get<HTMLButtonElement>('.inventory-actions button')
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
