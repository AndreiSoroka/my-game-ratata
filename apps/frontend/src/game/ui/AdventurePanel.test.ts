import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { adventureFixture, characterFixture } from '../testing/characterFixture'
import AdventurePanel from './AdventurePanel.vue'

function createPanel() {
    return mount(AdventurePanel, {
        props: {
            adventure: adventureFixture(),
            player: characterFixture('self'),
            characters: [],
            inventoryOpen: false,
            locationId: 'map-2-2',
            party: undefined,
            serverTime: 100_000,
        },
        attachTo: document.body,
    })
}
const escape = () =>
    new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true, cancelable: true })

describe('adventure window Escape ownership', () => {
    it.each([['Ремесло', '.adventure-crafting']])(
        'closes %s after background focus loss and restores the canvas',
        async (label, selector) => {
            const canvas = document.createElement('canvas')
            canvas.dataset.gameCanvas = ''
            canvas.tabIndex = 0
            document.body.append(canvas)
            const wrapper = createPanel()
            try {
                await wrapper
                    .findAll('.adventure-tools button')
                    .find((button) => button.text() === label)!
                    .trigger('click')
                expect(wrapper.find(selector).exists()).toBe(true)
                document.body.tabIndex = -1
                document.body.focus()
                const event = escape()
                document.body.dispatchEvent(event)
                await flushPromises()
                expect(event.defaultPrevented).toBe(true)
                expect(wrapper.find(selector).exists()).toBe(false)
                expect(document.activeElement).toBe(canvas)
            } finally {
                wrapper.unmount()
                canvas.remove()
                document.body.removeAttribute('tabindex')
            }
            const afterUnmount = escape()
            window.dispatchEvent(afterUnmount)
            expect(afterUnmount.defaultPrevented).toBe(false)
        }
    )
    it('leaves an unrelated dialog and hidden crafting panel untouched while inventory or conversation owns the UI', async () => {
        const wrapper = createPanel()
        const foreign = document.createElement('section')
        foreign.setAttribute('role', 'dialog')
        const button = document.createElement('button')
        foreign.append(button)
        document.body.append(foreign)
        try {
            await wrapper
                .findAll('.adventure-tools button')
                .find((candidate) => candidate.text() === 'Ремесло')!
                .trigger('click')
            button.focus()
            const foreignEscape = escape()
            button.dispatchEvent(foreignEscape)
            await flushPromises()
            expect(foreignEscape.defaultPrevented).toBe(false)
            expect(wrapper.find('.adventure-crafting').exists()).toBe(true)
            await wrapper.setProps({ inventoryOpen: true })
            const inventoryEscape = escape()
            window.dispatchEvent(inventoryEscape)
            expect(inventoryEscape.defaultPrevented).toBe(false)
            await wrapper.setProps({ inventoryOpen: false })
            expect(wrapper.find('.adventure-crafting').exists()).toBe(true)
            await wrapper.setProps({
                adventure: {
                    ...adventureFixture(),
                    dialogue: {
                        npcId: 'mira',
                        npcName: 'Мира',
                        title: 'Задание',
                        text: 'Принеси сердца.',
                        canTrade: false,
                        choices: [],
                    },
                },
            })
            const dialogueEscape = escape()
            window.dispatchEvent(dialogueEscape)
            expect(dialogueEscape.defaultPrevented).toBe(false)
            expect(wrapper.find('.adventure-dialogue').exists()).toBe(true)
        } finally {
            wrapper.unmount()
            foreign.remove()
        }
    })
})
