import type { Sound, SoundTrack } from 'excalibur'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { setAudioMuted } from './audioPreference'
import { GameMusic } from './gameMusic'
import type { WorldAmbienceSounds } from './worldAmbienceSounds'

function clip() {
    let state: 'stopped' | 'playing' | 'paused' = 'stopped'
    const start = () => {
        state = 'playing'
        return Promise.resolve(true)
    }
    return {
        get isPlaying() {
            return state === 'playing'
        },
        get isPaused() {
            return state === 'paused'
        },
        play: vi.fn<typeof start>(start),
        resume: vi.fn<typeof start>(start),
        pause: vi.fn<() => void>(() => {
            state = 'paused'
        }),
        stop: vi.fn<() => void>(() => {
            state = 'stopped'
        }),
    }
}

function setup() {
    const regular = clip()
    const battle = clip()
    const bank = {
        request: vi.fn<WorldAmbienceSounds['request']>(),
        isReady: vi.fn<WorldAmbienceSounds['isReady']>(() => true),
        play: vi.fn<WorldAmbienceSounds['play']>(() => {
            void battle.play()
            return battle as unknown as SoundTrack
        }),
    }
    const running = vi.fn<() => boolean>(() => true)
    const music = new GameMusic(regular as unknown as Sound, bank, running)
    return { music, regular, battle, bank, running }
}

beforeEach(() => {
    setAudioMuted(false)
})

afterEach(() => {
    window.history.replaceState({}, '', '/')
    setAudioMuted(false)
})

it('keeps the default music until the battle loop is ready and resumes its position afterward', () => {
    const { music, regular, battle, bank } = setup()
    bank.isReady.mockReturnValue(false)
    music.start()
    music.setBattle(true)
    music.update()

    expect(bank.request).toHaveBeenCalledExactlyOnceWith('forestBattle')
    expect(regular.isPlaying).toBe(true)
    expect(bank.play).not.toHaveBeenCalled()

    bank.isReady.mockReturnValue(true)
    music.update()
    music.update()
    music.setBattle(true)

    expect(bank.play).toHaveBeenCalledExactlyOnceWith('forestBattle', { loop: true })
    expect(regular.pause).toHaveBeenCalledOnce()
    expect(battle.isPlaying).toBe(true)

    music.setBattle(false)
    music.setBattle(false)
    music.update()
    expect(battle.stop).toHaveBeenCalledOnce()
    expect(regular.play).toHaveBeenCalledOnce()
    expect(regular.resume).toHaveBeenCalledOnce()
})

it('does not play a clip that finishes loading after battle ends', () => {
    const { music, regular, bank } = setup()
    bank.isReady.mockReturnValue(false)
    music.start()
    music.setBattle(true)
    music.setBattle(false)
    bank.isReady.mockReturnValue(true)
    music.update()

    expect(bank.play).not.toHaveBeenCalled()
    expect(regular.pause).not.toHaveBeenCalled()

    music.setBattle(true)
    expect(bank.play).toHaveBeenCalledOnce()
})

it('waits for browser audio before switching to a battle loop', () => {
    const { music, regular, battle, bank, running } = setup()
    running.mockReturnValue(false)
    music.start()
    music.setBattle(true)
    music.update()

    expect(regular.isPlaying).toBe(true)
    expect(bank.play).not.toHaveBeenCalled()

    running.mockReturnValue(true)
    music.update()
    expect(regular.isPaused).toBe(true)
    expect(battle.isPlaying).toBe(true)
})

it('pauses the battle track while hidden and resumes it after browser audio returns', () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    const { music, regular, battle, bank, running } = setup()
    music.start()
    music.setBattle(true)

    hidden.mockReturnValue(true)
    music.pause()
    music.update()
    expect(battle.isPaused).toBe(true)
    expect(regular.resume).not.toHaveBeenCalled()

    hidden.mockReturnValue(false)
    running.mockReturnValue(false)
    music.resume()
    expect(battle.isPaused).toBe(true)
    expect(regular.resume).not.toHaveBeenCalled()

    running.mockReturnValue(true)
    music.update()
    expect(battle.isPlaying).toBe(true)
    expect(bank.play).toHaveBeenCalledOnce()
    expect(regular.resume).not.toHaveBeenCalled()
})

it('keeps playing the default track when starting the optional track fails', () => {
    const { music, regular, bank } = setup()
    bank.play.mockReturnValueOnce(undefined)
    music.start()
    music.setBattle(true)
    music.update()
    music.update()

    expect(regular.isPlaying).toBe(true)
    expect(regular.pause).not.toHaveBeenCalled()
    expect(bank.play).toHaveBeenCalledOnce()

    music.setBattle(false)
    music.setBattle(true)
    expect(bank.play).toHaveBeenCalledTimes(2)
})

it('stops on mute and restores the music for the current battle state when unmuted', () => {
    const { music, regular, battle, bank } = setup()
    music.start()
    music.setBattle(true)

    setAudioMuted(true)
    music.stop()
    music.update()
    expect(battle.stop).toHaveBeenCalledOnce()
    expect(regular.stop).toHaveBeenCalledOnce()
    expect(bank.play).toHaveBeenCalledOnce()

    music.setBattle(false)
    setAudioMuted(false)
    music.resume()
    expect(regular.play).toHaveBeenCalledTimes(2)
    expect(bank.play).toHaveBeenCalledOnce()
})

it('does not prepare or play music in forced silence or after disposal', () => {
    window.history.replaceState({}, '', '/?test=1')
    const { music, regular, bank } = setup()
    music.prepareBattle()
    music.setBattle(true)
    music.start()
    music.update()
    expect(bank.request).not.toHaveBeenCalled()
    expect(bank.play).not.toHaveBeenCalled()
    expect(regular.play).not.toHaveBeenCalled()

    music.dispose()
    window.history.replaceState({}, '', '/')
    music.prepareBattle()
    music.resume()
    music.update()
    expect(bank.request).not.toHaveBeenCalled()
    expect(bank.play).not.toHaveBeenCalled()
    expect(regular.play).not.toHaveBeenCalled()
})
