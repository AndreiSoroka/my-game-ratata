import { mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'

import type { UiSoundId } from '../../../game/assets/soundCatalog'
import { isAudioMuted, setAudioMuted } from '../../../game/runtime/audioPreference'
import { isNpcVoiceEnabled, setNpcVoiceEnabled } from '../../../game/runtime/npcVoicePreference'
import GameMenu from '../ui/GameMenu.vue'
import { gameUiSoundKey } from './gameUiSound'

afterEach(() => {
    window.history.replaceState({}, '', '/')
    setAudioMuted(false)
    setNpcVoiceEnabled(false)
    window.localStorage.removeItem('ratata:npc-voice-enabled')
})
it('offers an accessible persistent sound toggle in ordinary play', async () => {
    setAudioMuted(false)
    const playUiSound = vi.fn<(_id: UiSoundId) => boolean>(() => isAudioMuted())
    const options = { global: { provide: { [gameUiSoundKey]: playUiSound } } }
    const wrapper = mount(GameMenu, options)
    try {
        const button = wrapper.get('[aria-label="Без звука"]')
        expect(button.attributes('aria-pressed')).toBe('false')
        await button.trigger('click')
        expect(button.attributes('aria-pressed')).toBe('true')
        expect(isAudioMuted()).toBe(true)
        expect(window.localStorage.getItem('ratata:audio-muted')).toBe('true')
        expect(playUiSound).not.toHaveBeenCalled()
    } finally {
        wrapper.unmount()
    }
    const reopened = mount(GameMenu, options)
    try {
        const button = reopened.get('[aria-label="Без звука"]')
        expect(button.attributes('aria-pressed')).toBe('true')
        await button.trigger('click')
        expect(button.attributes('aria-pressed')).toBe('false')
        expect(isAudioMuted()).toBe(false)
        expect(playUiSound).toHaveBeenCalledExactlyOnceWith('uiClick')
        expect(playUiSound).toHaveReturnedWith(false)
    } finally {
        reopened.unmount()
    }
})
it('keeps test sessions silent even when the saved preference enables audio', () => {
    setAudioMuted(false)
    setNpcVoiceEnabled(true)
    window.history.replaceState({}, '', '/?test=1')
    const wrapper = mount(GameMenu)
    try {
        const button = wrapper.get('[aria-label="Без звука"]')
        const voice = wrapper.get('[aria-label="Озвучка NPC"]')
        expect(button.attributes('disabled')).toBeDefined()
        expect(button.attributes('aria-pressed')).toBe('true')
        expect(voice.attributes('disabled')).toBeDefined()
        expect(voice.attributes('aria-pressed')).toBe('false')
        expect(voice.text()).toBe('Озвучка NPC: выключена')
        expect(isNpcVoiceEnabled()).toBe(true)
        expect(wrapper.text()).not.toContain('В этом режиме звук отключён.')
    } finally {
        wrapper.unmount()
    }
})
it('enables NPC voice by default and remembers overrides independently of master mute', async () => {
    const wrapper = mount(GameMenu)
    try {
        const button = wrapper.get('[aria-label="Озвучка NPC"]')
        expect(button.attributes('aria-pressed')).toBe('true')
        expect(isNpcVoiceEnabled()).toBe(true)
        expect(window.localStorage.getItem('ratata:npc-voice-enabled')).toBeNull()
        await button.trigger('click')
        expect(button.attributes('aria-pressed')).toBe('false')
        expect(window.localStorage.getItem('ratata:npc-voice-enabled')).toBe('false')
        await wrapper.get('[aria-label="Без звука"]').trigger('click')
        expect(isAudioMuted()).toBe(true)
        expect(isNpcVoiceEnabled()).toBe(false)
    } finally {
        wrapper.unmount()
    }
    const reopened = mount(GameMenu)
    try {
        const button = reopened.get('[aria-label="Озвучка NPC"]')
        expect(button.attributes('aria-pressed')).toBe('false')
        await button.trigger('click')
        expect(button.attributes('aria-pressed')).toBe('true')
        expect(isNpcVoiceEnabled()).toBe(true)
        expect(window.localStorage.getItem('ratata:npc-voice-enabled')).toBe('true')
        expect(isAudioMuted()).toBe(true)
    } finally {
        reopened.unmount()
    }
})
