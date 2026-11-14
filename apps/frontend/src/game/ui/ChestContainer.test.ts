import { INVENTORY_CAPACITY, type ItemInstanceSnapshot } from '@my-game-ratata/contracts'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import { characterFixture } from '../testing/characterFixture'
import ChestContainer from './ChestContainer.vue'

const items: ItemInstanceSnapshot[] = [
    { instanceId: 'food-1', itemId: 'food' },
    { instanceId: 'sword-2', itemId: 'simple_sword' },
    { instanceId: 'boots-3', itemId: 'boots' },
]
const bagItem: ItemInstanceSnapshot = { instanceId: 'bag-sword', itemId: 'old_sword' }

describe('chest stack capacity', () => {
    it('allows a whole stack that fits a partial bag stack at 50 slots, but refuses larger or unmatched stacks', async () => {
        const inventory: ItemInstanceSnapshot[] = Array.from({ length: 49 }, (_, index) => ({
            instanceId: `food-${String(index)}`,
            itemId: 'food',
        }))
        inventory.push({ instanceId: 'herb-bag', itemId: 'herbs', quantity: 8 })
        const contents: ItemInstanceSnapshot[] = [
            { instanceId: 'herb-one', itemId: 'herbs' },
            { instanceId: 'herb-two', itemId: 'herbs', quantity: 2 },
            { instanceId: 'wood', itemId: 'wood' },
        ]
        const player = characterFixture('self', { inventory })
        const wrapper = mount(ChestContainer, {
            props: { chest: { chestId: 'chest', items: contents }, player },
            attachTo: document.body,
        })
        try {
            await flushPromises()
            expect(wrapper.get('.chest-capacity').text()).toContain('50 / 50 слотов')
            const one = wrapper.get('[data-dialog-action="chest:herb-one"]')
            expect(one.attributes('disabled')).toBeUndefined()
            expect(
                wrapper.get('[data-dialog-action="chest:herb-two"]').attributes('disabled')
            ).toBeDefined()
            expect(
                wrapper.get('[data-dialog-action="chest:wood"]').attributes('disabled')
            ).toBeDefined()
            expect(wrapper.get('[data-dialog-action="bag:herb-bag"]').attributes('title')).toBe(
                'Лечебные травы × 8'
            )
            expect(wrapper.get('[data-dialog-action="chest:herb-two"]').text()).toContain(
                'Лечебные травы × 2'
            )
            await one.trigger('click')
            expect(wrapper.emitted('command')).toEqual([
                [{ type: 'take_chest_item', chestId: 'chest', itemInstanceId: 'herb-one' }],
            ])
            expect(wrapper.get('[data-dialog-action="all"]').attributes('disabled')).toBeUndefined()
            await wrapper.get('[data-dialog-action="all"]').trigger('click')
            expect(wrapper.emitted('command')?.at(-1)).toEqual([
                { type: 'take_all_chest_items', chestId: 'chest' },
            ])
            await wrapper.setProps({
                player: {
                    ...player,
                    inventory: inventory.map((item) =>
                        item.itemId === 'herbs' ? { ...item, quantity: 9 } : item
                    ),
                },
            })
            expect(wrapper.get('[data-dialog-action="all"]').attributes('disabled')).toBeDefined()
            expect(one.attributes('disabled')).toBeDefined()
            expect(
                wrapper.get('[data-dialog-action="bag:herb-bag"]').attributes('disabled')
            ).toBeUndefined()
        } finally {
            wrapper.unmount()
        }
    })
})

describe('two-sided chest keyboard interaction', () => {
    it('switches sides with arrows and confirms exactly one put or take with E, without optimistic mutations', async () => {
        const player = characterFixture('self', { inventory: [bagItem] })
        const wrapper = mount(ChestContainer, {
            props: { chest: { chestId: 'chest', items }, player },
            attachTo: document.body,
        })
        try {
            await flushPromises()
            const food = wrapper.get('[data-dialog-action="chest:food-1"]')
            expect(document.activeElement).toBe(food.element)
            await food.trigger('keydown', { code: 'ArrowLeft' })
            const own = wrapper.get('[data-dialog-action="bag:bag-sword"]')
            expect(document.activeElement).toBe(own.element)
            await own.trigger('keydown', { code: 'KeyE', key: 'у', repeat: true })
            expect(wrapper.emitted('command')).toBeUndefined()
            await own.trigger('keydown', { code: 'KeyE', key: 'у' })
            expect(wrapper.emitted('command')?.at(-1)).toEqual([
                { type: 'put_chest_item', chestId: 'chest', itemInstanceId: 'bag-sword' },
            ])
            expect(wrapper.findAll('[data-chest-pane="bag"] .chest-items button')).toHaveLength(1)
            await own.trigger('keydown', { code: 'ArrowRight' })
            await food.trigger('keydown', { code: 'KeyF', key: 'а' })
            expect(wrapper.emitted('command')).toHaveLength(1)
            await food.trigger('keydown', { code: 'KeyE', key: 'у' })
            expect(wrapper.emitted('command')?.at(-1)).toEqual([
                { type: 'take_chest_item', chestId: 'chest', itemInstanceId: 'food-1' },
            ])
            expect(wrapper.findAll('[data-chest-pane="chest"] .chest-items button')).toHaveLength(3)
        } finally {
            wrapper.unmount()
        }
    })
    it('keeps focus across snapshots and moves to the next item on the same side after removal', async () => {
        const wrapper = mount(ChestContainer, {
            props: { chest: { chestId: 'chest', items }, player: characterFixture('self') },
            attachTo: document.body,
        })
        try {
            await flushPromises()
            await wrapper
                .get('[data-dialog-action="chest:food-1"]')
                .trigger('keydown', { code: 'KeyS', key: 'ы' })
            const sword = wrapper.get('[data-dialog-action="chest:sword-2"]')
            expect(document.activeElement).toBe(sword.element)
            await wrapper.setProps({
                chest: { chestId: 'chest', items: items.map((item) => ({ ...item })) },
            })
            expect(document.activeElement).toBe(sword.element)
            await wrapper.setProps({ chest: { chestId: 'chest', items: [items[0]!, items[2]!] } })
            await flushPromises()
            expect(document.activeElement).toBe(
                wrapper.get('[data-dialog-action="chest:boots-3"]').element
            )
        } finally {
            wrapper.unmount()
        }
    })
    it('supports take-all, an empty side, modal Tab and Escape after clicking a plain header', async () => {
        const wrapper = mount(ChestContainer, {
            props: { chest: { chestId: 'chest', items }, player: characterFixture('self') },
            attachTo: document.body,
        })
        try {
            await flushPromises()
            const all = wrapper.get<HTMLButtonElement>('[data-dialog-action="all"]')
            all.element.focus()
            await all.trigger('keydown', { code: 'KeyE' })
            expect(wrapper.emitted('command')).toEqual([
                [{ type: 'take_all_chest_items', chestId: 'chest' }],
            ])
            await wrapper.setProps({ chest: { chestId: 'chest', items: [] } })
            await flushPromises()
            expect(wrapper.text()).toContain('Контейнер пуст')
            expect(document.activeElement).toBe(wrapper.get('[data-chest-pane="chest"]').element)
            await wrapper.get('[data-chest-pane="chest"]').trigger('keydown', { code: 'Tab' })
            expect(document.activeElement).toBe(wrapper.get('[data-dialog-action="close"]').element)
            await wrapper.get('h2').trigger('pointerdown')
            expect(document.activeElement).toBe(wrapper.get('[role="dialog"]').element)
            await wrapper.get('[role="dialog"]').trigger('keydown', { code: 'Escape' })
            expect(wrapper.emitted('close')).toHaveLength(1)
        } finally {
            wrapper.unmount()
        }
    })
})

describe('chest interaction with a full bag', () => {
    it('keeps put available in a full bag, excludes equipment, and blocks game keys', async () => {
        const worldKey = vi.fn<(event: KeyboardEvent) => void>()
        window.addEventListener('keydown', worldKey)
        const inventory: ItemInstanceSnapshot[] = Array.from(
            { length: INVENTORY_CAPACITY },
            (_, index) => ({ instanceId: `bag-${String(index)}`, itemId: 'food' })
        )
        const player = characterFixture('self', {
            inventory,
            equipment: { weapon: { instanceId: 'equipped-sword', itemId: 'old_sword' } },
        })
        const wrapper = mount(ChestContainer, {
            props: { chest: { chestId: 'chest', items }, player },
            attachTo: document.body,
        })
        try {
            await flushPromises()
            expect(wrapper.text()).toContain('свободно 0')
            expect(
                wrapper.findAll('[data-chest-pane="chest"] .chest-items button:disabled')
            ).toHaveLength(3)
            expect(wrapper.get('[data-dialog-action="all"]').attributes('disabled')).toBeDefined()
            expect(wrapper.find('[data-dialog-action="bag:equipped-sword"]').exists()).toBe(false)
            const own = wrapper.get<HTMLButtonElement>('[data-dialog-action="bag:bag-0"]')
            own.element.focus()
            await own.trigger('keydown', { code: 'KeyQ' })
            expect(worldKey).not.toHaveBeenCalled()
            await own.trigger('keydown', { code: 'KeyE' })
            expect(wrapper.emitted('command')?.at(-1)).toEqual([
                { type: 'put_chest_item', chestId: 'chest', itemInstanceId: 'bag-0' },
            ])
        } finally {
            wrapper.unmount()
            window.removeEventListener('keydown', worldKey)
        }
    })
})
