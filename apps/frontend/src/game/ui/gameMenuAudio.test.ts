import { mount } from '@vue/test-utils'
import { afterEach, expect, it } from 'vitest'

import { isAudioMuted, setAudioMuted } from '../runtime/audioPreference'
import GameMenu from './GameMenu.vue'

afterEach(() => {
    window.history.replaceState({}, '', '/')
    setAudioMuted(false)
})
it('offers an accessible persistent sound toggle in ordinary play', async () => {
    setAudioMuted(false)
    const wrapper = mount(GameMenu)
    try {
        const button = wrapper.get('[aria-label="Без звука"]')
        expect(button.attributes('aria-pressed')).toBe('false')
        await button.trigger('click')
        expect(button.attributes('aria-pressed')).toBe('true')
        expect(isAudioMuted()).toBe(true)
        expect(window.localStorage.getItem('ratata:audio-muted')).toBe('true')
    } finally {
        wrapper.unmount()
    }
    const reopened = mount(GameMenu)
    try {
        const button = reopened.get('[aria-label="Без звука"]')
        expect(button.attributes('aria-pressed')).toBe('true')
        await button.trigger('click')
        expect(button.attributes('aria-pressed')).toBe('false')
        expect(isAudioMuted()).toBe(false)
    } finally {
        reopened.unmount()
    }
})
it('keeps test sessions silent even when the saved preference enables audio', () => {
    setAudioMuted(false)
    window.history.replaceState({}, '', '/?test=1')
    const wrapper = mount(GameMenu)
    try {
        const button = wrapper.get('[aria-label="Без звука"]')
        expect(button.attributes('disabled')).toBeDefined()
        expect(button.attributes('aria-pressed')).toBe('true')
        expect(wrapper.text()).toContain('В этом режиме звук отключён.')
    } finally {
        wrapper.unmount()
    }
})
