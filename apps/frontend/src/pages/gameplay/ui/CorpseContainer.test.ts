import { INVENTORY_CAPACITY } from '@my-game-ratata/contracts'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { characterFixture } from '@/game/testing/characterFixture'

import ChestContainer from './ChestContainer.vue'

describe('corpse inspection uses the shared container window', () => {
    it('names the fallen character, refuses deposits and takes gold with a full bag', async () => {
        const player = characterFixture('self', {
            inventory: Array.from({ length: INVENTORY_CAPACITY }, (_, index) => ({
                instanceId: `food-${String(index)}`,
                itemId: 'food',
            })),
        })
        const wrapper = mount(ChestContainer, {
            props: {
                player,
                chest: {
                    chestId: 'corpse:hero:1',
                    kind: 'corpse',
                    title: 'Тело: Андрей',
                    gold: 37,
                    items: [],
                },
            },
            attachTo: document.body,
        })
        try {
            await flushPromises()
            expect(wrapper.get('h2').text()).toBe('Тело: Андрей')
            expect(
                wrapper.get('[data-dialog-action="bag:food-0"]').attributes('disabled')
            ).toBeDefined()
            const gold = wrapper.get('[data-dialog-action="chest:gold"]')
            expect(document.activeElement).toBe(gold.element)
            await gold.trigger('keydown', { code: 'KeyF' })
            expect(wrapper.emitted('command')).toEqual([
                [{ type: 'take_chest_gold', chestId: 'corpse:hero:1' }],
            ])
            expect(wrapper.get('[data-dialog-action="all"]').attributes('disabled')).toBeUndefined()
            await wrapper.get('[data-dialog-action="all"]').trigger('click')
            expect(wrapper.emitted('command')?.at(-1)).toEqual([
                { type: 'take_all_chest_items', chestId: 'corpse:hero:1' },
            ])
            await wrapper.setProps({
                chest: { chestId: 'corpse:hero:1', kind: 'corpse', gold: 0, items: [] },
            })
            expect(wrapper.find('[data-dialog-action="chest:gold"]').exists()).toBe(false)
            expect(wrapper.get('[data-dialog-action="all"]').attributes('disabled')).toBeDefined()
        } finally {
            wrapper.unmount()
        }
    })
})
