import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { UiSoundId } from '../../../game/assets/soundCatalog'
import { gameUiSoundKey } from '../model/gameUiSound'
import NearbyActionMenu from './NearbyActionMenu.vue'

const actions = [
    { id: 'locked', label: 'Недоступно', disabled: true },
    { id: 'talk', label: 'Поговорить с Мирой' },
    { id: 'sow', label: 'Посеять пшеницу' },
]
afterEach(() => {
    document.body.innerHTML = ''
})

describe('nearby action menu', () => {
    it('focuses enabled actions, wraps and skips disabled items using arrows and W/S', async () => {
        const playUiSound = vi.fn<(id: UiSoundId) => void>()
        const wrapper = mount(NearbyActionMenu, {
            props: { open: true, actions },
            attachTo: document.body,
            global: { provide: { [gameUiSoundKey]: playUiSound } },
        })
        try {
            await flushPromises()
            const items = wrapper.findAll('[role="menuitem"]')
            expect(document.activeElement).toBe(items[1]?.element)
            expect(items[0]?.attributes('disabled')).toBeDefined()
            await items[1]?.trigger('keydown', { key: 'Home' })
            expect(playUiSound).not.toHaveBeenCalled()
            await items[1]?.trigger('keydown', { key: 'ArrowUp' })
            expect(document.activeElement).toBe(items[2]?.element)
            await items[2]?.trigger('keydown', { key: 'ы', code: 'KeyS' })
            expect(document.activeElement).toBe(items[1]?.element)
            await items[1]?.trigger('keydown', { key: 'End' })
            expect(document.activeElement).toBe(items[2]?.element)
            await items[2]?.trigger('keydown', { key: 'w' })
            expect(document.activeElement).toBe(items[1]?.element)
            expect(items.filter((item) => item.attributes('tabindex') === '0')).toHaveLength(1)
            expect(playUiSound.mock.calls).toEqual(Array.from({ length: 4 }, () => ['uiSelect']))
        } finally {
            wrapper.unmount()
        }
    })
    it('emits ordinary action IDs and prevents keyboard movement or attack from reaching the game', async () => {
        const wrapper = mount(NearbyActionMenu, {
            props: { open: true, actions },
            attachTo: document.body,
        })
        const gameKey = vi.fn<(event: KeyboardEvent) => void>()
        window.addEventListener('keydown', gameKey)
        window.addEventListener('keyup', gameKey)
        try {
            await flushPromises()
            const talk = wrapper.get('[data-action-id="talk"]')
            await talk.trigger('keydown', { key: 'Enter', code: 'Enter' })
            expect(wrapper.emitted('select')).toEqual([['talk']])
            await talk.trigger('keydown', { key: 's', code: 'KeyS' })
            await talk.trigger('keyup', { key: 's', code: 'KeyS' })
            await wrapper
                .get('[data-action-id="sow"]')
                .trigger('keydown', { key: ' ', code: 'Space' })
            expect(wrapper.emitted('select')).toEqual([['talk'], ['sow']])
            expect(gameKey).not.toHaveBeenCalled()
        } finally {
            wrapper.unmount()
            window.removeEventListener('keydown', gameKey)
            window.removeEventListener('keyup', gameKey)
        }
    })
    it('restores the opener after Escape and refocuses when an action disappears', async () => {
        const opener = document.createElement('button')
        document.body.append(opener)
        opener.focus()
        const wrapper = mount(NearbyActionMenu, {
            props: { open: false, actions },
            attachTo: document.body,
        })
        try {
            expect(wrapper.find('[role="menu"]').exists()).toBe(false)
            await wrapper.setProps({ open: true })
            await flushPromises()
            await wrapper.setProps({ actions: [actions[2]!] })
            await flushPromises()
            expect(document.activeElement).toBe(wrapper.get('[data-action-id="sow"]').element)
            await wrapper.get('[role="menu"]').trigger('keydown', { key: 'Escape' })
            expect(wrapper.emitted('close')).toHaveLength(1)
            await wrapper.setProps({ open: false })
            expect(document.activeElement).toBe(opener)
        } finally {
            wrapper.unmount()
        }
    })
    it('waits for a fresh F confirmation after opening and ignores held-key repeat', async () => {
        const wrapper = mount(NearbyActionMenu, {
            props: { open: false, actions },
            attachTo: document.body,
        })
        try {
            await wrapper.setProps({ open: true })
            await flushPromises()
            expect(wrapper.emitted('select')).toBeUndefined()
            const talk = wrapper.get('[data-action-id="talk"]')
            await talk.trigger('keydown', { code: 'KeyE', key: 'e' })
            await talk.trigger('keydown', { code: 'KeyE', key: 'у' })
            expect(wrapper.emitted('select')).toBeUndefined()
            await talk.trigger('keydown', { code: 'KeyF', key: 'а', repeat: true })
            expect(wrapper.emitted('select')).toBeUndefined()
            await talk.trigger('keydown', { code: 'KeyF', key: 'а' })
            expect(wrapper.emitted('select')).toEqual([['talk']])
        } finally {
            wrapper.unmount()
        }
    })
})

describe('neighbor buttons', () => {
    it('confirms a focused switch button without activating the current action', async () => {
        const wrapper = mount(NearbyActionMenu, {
            props: {
                open: true,
                actions,
                neighbors: { right: { key: 'character:mira', name: 'Мира' } },
            },
            attachTo: document.body,
        })
        try {
            await flushPromises()
            const button = wrapper.get<HTMLButtonElement>('[data-dialogue-target-switch]')
            expect(button.attributes('tabindex')).toBe('-1')
            button.element.focus()
            await button.trigger('keydown', { code: 'KeyF', key: 'а' })
            expect(wrapper.emitted('switchCharacter')).toEqual([['character:mira']])
            expect(wrapper.emitted('select')).toBeUndefined()
            await button.trigger('keydown', { code: 'ArrowRight', altKey: true })
            expect(wrapper.emitted('switchCharacter')).toHaveLength(1)
        } finally {
            wrapper.unmount()
        }
    })
})
