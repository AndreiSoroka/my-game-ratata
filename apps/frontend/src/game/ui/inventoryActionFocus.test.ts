import type { ItemInstanceSnapshot } from '@my-game-ratata/contracts'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import { characterFixture } from '../testing/characterFixture'
import InventoryOverlay from './InventoryOverlay.vue'

const wood: ItemInstanceSnapshot = { instanceId: 'wood', itemId: 'wood' }
const boots: ItemInstanceSnapshot = { instanceId: 'boots', itemId: 'boots' }
const oldBoots: ItemInstanceSnapshot = { instanceId: 'old-boots', itemId: 'boots' }
const apple: ItemInstanceSnapshot = { instanceId: 'apple', itemId: 'food' }

function inventory(inventory: ItemInstanceSnapshot[]) {
    return mount(InventoryOverlay, {
        props: { character: characterFixture('self', { inventory }), chests: [] },
        attachTo: document.body,
    })
}

describe('inventory action focus', () => {
    for (const swap of [false, true]) {
        it(`returns to the same bag cell after equipping${swap ? ' and replacing existing equipment' : ''}`, async () => {
            const wrapper = inventory([wood, boots, apple])
            try {
                if (swap)
                    await wrapper.setProps({
                        character: characterFixture('self', {
                            inventory: [wood, boots, apple],
                            equipment: { boots: oldBoots },
                        }),
                    })
                await flushPromises()
                const slot = wrapper.findAll<HTMLButtonElement>('.inventory-slot')[1]!
                slot.element.focus()
                await slot.trigger('keydown', { code: 'Enter' })
                await flushPromises()
                const equip = wrapper.get<HTMLButtonElement>('.inventory-actions button')
                expect(equip.text()).toBe('Equip')
                expect(document.activeElement).toBe(equip.element)
                await equip.trigger('keydown', { code: 'Enter' })
                expect(wrapper.emitted('inventoryAction')).toEqual([
                    [{ action: 'equip', itemInstanceId: 'boots' }],
                ])

                await wrapper.setProps({
                    character: characterFixture('self', {
                        inventory: swap ? [wood, apple, oldBoots] : [wood, apple],
                        equipment: { boots },
                    }),
                })
                await flushPromises()
                const cells = wrapper.findAll<HTMLButtonElement>('.inventory-slot')
                expect(document.activeElement).toBe(cells[1]!.element)
                expect(cells[1]!.attributes('data-item-instance-id')).toBe('apple')
                expect(wrapper.find('.inventory-actions').exists()).toBe(false)

                // A held confirmation must not select or use the item that shifted into this cell.
                await cells[1]!.trigger('keydown', { code: 'Enter', repeat: true })
                expect(wrapper.find('.inventory-actions').exists()).toBe(false)
                expect(wrapper.emitted('inventoryAction')).toHaveLength(1)
                await cells[1]!.trigger('keydown', { code: 'ArrowRight' })
                expect(document.activeElement).toBe(cells[2]!.element)
                await cells[2]!.trigger('keydown', { code: 'ArrowLeft' })
                expect(document.activeElement).toBe(cells[1]!.element)
            } finally {
                wrapper.unmount()
            }
        })
    }

    it('keeps the original cell focused when the last bag item is dropped', async () => {
        const wrapper = inventory([wood, apple])
        try {
            await flushPromises()
            await wrapper.get('[data-item-instance-id="apple"]').trigger('click')
            await flushPromises()
            const drop = wrapper
                .findAll<HTMLButtonElement>('.inventory-actions button')
                .find((button) => button.text() === 'Drop')!
            drop.element.focus()
            await drop.trigger('keydown', { code: 'KeyE' })
            await wrapper.setProps({
                character: characterFixture('self', { inventory: [wood] }),
            })
            await flushPromises()
            expect(document.activeElement).toBe(wrapper.get('[aria-label="Empty slot 2"]').element)
            expect(wrapper.find('.inventory-actions').exists()).toBe(false)
            expect(wrapper.emitted('inventoryAction')).toEqual([
                [{ action: 'drop', itemInstanceId: 'apple' }],
            ])
        } finally {
            wrapper.unmount()
        }
    })

    it('preserves the focused grid cell when an unrelated bag update compacts the contents', async () => {
        const wrapper = inventory([wood, boots, apple])
        try {
            await flushPromises()
            wrapper.get<HTMLButtonElement>('[data-item-instance-id="boots"]').element.focus()
            await wrapper.setProps({
                character: characterFixture('self', { inventory: [boots, apple] }),
            })
            await flushPromises()
            expect(document.activeElement).toBe(
                wrapper.findAll<HTMLButtonElement>('.inventory-slot')[1]!.element
            )
            expect(wrapper.find('.inventory-actions').exists()).toBe(false)
        } finally {
            wrapper.unmount()
        }
    })

    it('keeps the first empty cell focused after eating the only item', async () => {
        const wrapper = inventory([apple])
        try {
            await flushPromises()
            await wrapper.get('[data-item-instance-id="apple"]').trigger('click')
            await flushPromises()
            const eat = wrapper.get<HTMLButtonElement>('.inventory-actions button')
            await eat.trigger('keydown', { code: 'Enter' })
            await wrapper.setProps({ character: characterFixture('self') })
            await flushPromises()
            expect(document.activeElement).toBe(wrapper.get('[aria-label="Empty slot 1"]').element)
            expect(wrapper.emitted('inventoryAction')).toEqual([
                [{ action: 'eat', itemInstanceId: 'apple' }],
            ])
        } finally {
            wrapper.unmount()
        }
    })
})

describe('inventory focus ownership and lifetime', () => {
    it('leaves the action focused when the command fails and the selected item remains', async () => {
        const wrapper = inventory([boots])
        try {
            await flushPromises()
            await wrapper.get('[data-item-instance-id="boots"]').trigger('click')
            await flushPromises()
            const equip = wrapper.get<HTMLButtonElement>('.inventory-actions button')
            await equip.trigger('keydown', { code: 'Enter' })
            await wrapper.setProps({ character: characterFixture('self', { inventory: [boots] }) })
            await flushPromises()
            expect(document.activeElement).toBe(equip.element)
            expect(wrapper.find('.inventory-actions').exists()).toBe(true)
        } finally {
            wrapper.unmount()
        }
    })

    for (const destination of ['inventory close button', 'another dialog'] as const) {
        it(`does not steal focus from ${destination} during an inventory update`, async () => {
            const wrapper = inventory([boots])
            const dialog = document.createElement('section')
            dialog.setAttribute('role', 'dialog')
            const otherButton = document.createElement('button')
            dialog.append(otherButton)
            document.body.append(dialog)
            try {
                await flushPromises()
                await wrapper.get('[data-item-instance-id="boots"]').trigger('click')
                await flushPromises()
                const destinationButton =
                    destination === 'another dialog'
                        ? otherButton
                        : wrapper.get<HTMLButtonElement>('[aria-label="Close inventory"]').element
                const update = wrapper.setProps({ character: characterFixture('self') })
                // Move focus after Vue patches the inventory, before queued restoration runs.
                void nextTick(() => destinationButton.focus())
                await update
                await flushPromises()
                expect(document.activeElement).toBe(destinationButton)
            } finally {
                wrapper.unmount()
                dialog.remove()
            }
        })
    }

    it('does not restore focus into an inventory closed during a pending update', async () => {
        const wrapper = inventory([boots])
        const replacementDialog = document.createElement('section')
        replacementDialog.setAttribute('role', 'dialog')
        const otherButton = document.createElement('button')
        replacementDialog.append(otherButton)
        document.body.append(replacementDialog)
        try {
            await flushPromises()
            await wrapper.get('[data-item-instance-id="boots"]').trigger('click')
            await flushPromises()
            const update = wrapper.setProps({ character: characterFixture('self') })
            void nextTick(() => {
                wrapper.unmount()
                otherButton.focus()
            })
            await update
            await flushPromises()
            expect(document.activeElement).toBe(otherButton)
        } finally {
            wrapper.unmount()
            replacementDialog.remove()
        }
    })
})
