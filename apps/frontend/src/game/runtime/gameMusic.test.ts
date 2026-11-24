import type { Sound, SoundTrack } from 'excalibur'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { setAudioMuted } from './audioPreference'
import { GameMusic } from './gameMusic'
import type { WorldAmbienceSounds } from './worldAmbienceSounds'

function clip() {
    let state: 'stopped' | 'playing' | 'paused' = 'stopped'
    const playedAtVolumes: number[] = []
    const track = {
        volume: 1,
        playedAtVolumes,
        get isPlaying() {
            return state === 'playing'
        },
        get isPaused() {
            return state === 'paused'
        },
        get isStopped() {
            return state === 'stopped'
        },
        play: vi.fn<SoundTrack['play']>(() => {
            state = 'playing'
            playedAtVolumes.push(track.volume)
            return Promise.resolve(true)
        }),
        pause: vi.fn<SoundTrack['pause']>(() => {
            state = 'paused'
        }),
        stop: vi.fn<SoundTrack['stop']>(() => {
            state = 'stopped'
        }),
    }
    return track
}

function setup() {
    const regular = clip()
    const battle = clip()
    const exploration = {
        start: vi.fn<Sound['start']>((options) => startClip(regular, options?.volume)),
    }
    const bank = {
        request: vi.fn<WorldAmbienceSounds['request']>(),
        isReady: vi.fn<WorldAmbienceSounds['isReady']>(() => true),
        play: vi.fn<WorldAmbienceSounds['play']>((_, options) =>
            startClip(battle, options?.volume)
        ),
    }
    const running = vi.fn<() => boolean>(() => true)
    const music = new GameMusic(exploration as unknown as Sound, bank, running)
    return { music, regular, battle, exploration, bank, running }
}

function startClip(track: ReturnType<typeof clip>, volume = 1): SoundTrack {
    track.volume = volume
    void track.play()
    return track as unknown as SoundTrack
}

beforeEach(() => {
    setAudioMuted(false)
})

afterEach(() => {
    window.history.replaceState({}, '', '/')
    setAudioMuted(false)
    vi.restoreAllMocks()
})

it('crossfades with equal power and resumes the original exploration track', () => {
    const { music, regular, battle, exploration, bank } = setup()
    music.start()
    music.setBattle(true)

    expect(bank.play).toHaveBeenCalledExactlyOnceWith('forestBattle', { loop: true, volume: 0 })
    expect(regular.volume).toBe(1)
    expect(battle.volume).toBe(0)
    music.update(750)
    expect(regular.volume).toBeCloseTo(Math.SQRT1_2)
    expect(battle.volume).toBeCloseTo(Math.SQRT1_2)
    expect(regular.isPlaying && battle.isPlaying).toBe(true)
    music.update(750)
    expect(regular.volume).toBe(0)
    expect(battle.volume).toBe(1)
    music.update(299)
    expect(regular.isPlaying).toBe(true)
    music.update(1)
    expect(regular.isPaused).toBe(true)

    music.setBattle(false)
    expect(regular.playedAtVolumes).toEqual([1, 0])
    expect(exploration.start).toHaveBeenCalledOnce()
    music.update(1250)
    expect(regular.volume).toBeCloseTo(Math.SQRT1_2)
    expect(battle.volume).toBeCloseTo(Math.SQRT1_2)
    music.update(1250)
    expect(regular.volume).toBe(1)
    expect(battle.volume).toBe(0)
    music.update(299)
    expect(battle.isPlaying).toBe(true)
    music.update(1)
    expect(music.hasBattleTrack).toBe(false)
    expect(battle.stop).toHaveBeenCalledOnce()
    expect(regular.isPlaying).toBe(true)
})

it('reverses the fade at its current levels and keeps the original battle track playing', () => {
    const { music, regular, battle, bank } = setup()
    music.start()
    music.setBattle(true)
    music.update(1500)
    music.update(300)
    music.setBattle(false)
    music.update(1250)
    const levels = [regular.volume, battle.volume]

    music.setBattle(true)
    expect([regular.volume, battle.volume]).toEqual(levels)
    music.update(375)
    expect(regular.volume).toBeCloseTo(Math.sin(Math.PI / 8))
    expect(battle.volume).toBeCloseTo(Math.sin((3 * Math.PI) / 8))
    music.update(375)
    music.update(300)
    expect(bank.play).toHaveBeenCalledOnce()
    expect(battle.play).toHaveBeenCalledOnce()
    expect(battle.stop).not.toHaveBeenCalled()
    expect(regular.isPaused && battle.isPlaying).toBe(true)
})

it('finishes releasing the battle track when exploration fails to resume', () => {
    const { music, regular, battle } = setup()
    music.start()
    music.setBattle(true)
    music.update(1500)
    music.update(300)
    expect(regular.isPaused).toBe(true)

    regular.play.mockRejectedValue(new Error('Exploration cannot resume'))
    music.setBattle(false)
    music.update(2500)
    expect(battle.volume).toBe(0)
    music.update(300)
    expect(battle.isStopped).toBe(true)
    expect(music.hasBattleTrack).toBe(false)
})

it('finishes releasing the battle track while the browser audio context is suspended', () => {
    const { music, battle, running } = setup()
    music.start()
    music.setBattle(true)
    music.update(1500)
    music.update(300)

    music.setBattle(false)
    music.update(1000)
    running.mockReturnValue(false)
    music.update(1500)
    music.update(300)
    expect(battle.isStopped).toBe(true)
    expect(music.hasBattleTrack).toBe(false)
})

it('keeps exploration at full volume until the optional track is ready and audio is running', () => {
    const { music, regular, battle, bank, running } = setup()
    bank.isReady.mockReturnValue(false)
    running.mockReturnValue(false)
    music.start()
    music.setBattle(true)
    music.update(750)
    bank.isReady.mockReturnValue(true)
    music.update(750)

    expect(bank.request).toHaveBeenCalledExactlyOnceWith('forestBattle')
    expect(regular.isPlaying).toBe(true)
    expect(regular.volume).toBe(1)
    expect(bank.play).not.toHaveBeenCalled()

    running.mockReturnValue(true)
    music.update(0)
    expect(battle.playedAtVolumes).toEqual([0])
    expect(regular.volume).toBe(1)
    music.update(750)
    expect(battle.volume).toBeCloseTo(Math.SQRT1_2)
})

it('ignores a clip that loads after the battle has ended', () => {
    const { music, regular, bank } = setup()
    bank.isReady.mockReturnValue(false)
    music.start()
    music.setBattle(true)
    music.setBattle(false)
    bank.isReady.mockReturnValue(true)
    music.update(3000)

    expect(bank.play).not.toHaveBeenCalled()
    expect(regular.isPlaying).toBe(true)
    expect(regular.volume).toBe(1)
})

it('keeps exploration at full volume if battle playback fails to start', () => {
    const { music, regular, bank } = setup()
    bank.play.mockReturnValueOnce(undefined)
    music.start()
    music.setBattle(true)
    music.update(2000)

    expect(regular.isPlaying).toBe(true)
    expect(regular.volume).toBe(1)
    expect(bank.play).toHaveBeenCalledOnce()

    music.setBattle(false)
    music.setBattle(true)
    expect(bank.play).toHaveBeenCalledTimes(2)
})

it('hard-resets the battle while hidden and restores the paused exploration track at full gain', () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    const { music, regular, battle, bank, exploration } = setup()
    music.start()
    music.setBattle(true)
    music.update(750)

    hidden.mockReturnValue(true)
    music.pause()
    expect(regular.isPaused && battle.isPaused).toBe(true)
    music.resetBattle()
    expect(battle.isStopped).toBe(true)
    expect(regular.playedAtVolumes).toEqual([1])

    hidden.mockReturnValue(false)
    music.resume()
    expect(exploration.start).toHaveBeenCalledOnce()
    expect(regular.playedAtVolumes).toEqual([1, 1])
    expect(bank.play).toHaveBeenCalledOnce()
})

it('stops both tracks immediately on mute during a crossfade', () => {
    const { music, regular, battle, exploration, bank } = setup()
    music.start()
    music.setBattle(true)
    music.update(750)

    setAudioMuted(true)
    music.stop()
    music.update(750)
    expect(battle.stop).toHaveBeenCalledOnce()
    expect(regular.stop).toHaveBeenCalledOnce()

    setAudioMuted(false)
    music.resume()
    expect(exploration.start).toHaveBeenCalledTimes(2)
    expect(regular.volume).toBe(1)
    expect(bank.play).toHaveBeenCalledOnce()
})

it('does not prepare or play music in forced silence or after disposal', () => {
    window.history.replaceState({}, '', '/?test=1')
    const { music, exploration, bank } = setup()
    music.prepareBattle()
    music.setBattle(true)
    music.start()
    music.update(750)
    expect(bank.request).not.toHaveBeenCalled()
    expect(bank.play).not.toHaveBeenCalled()
    expect(exploration.start).not.toHaveBeenCalled()

    music.dispose()
    window.history.replaceState({}, '', '/')
    music.prepareBattle()
    music.resume()
    music.update(750)
    expect(bank.request).not.toHaveBeenCalled()
    expect(bank.play).not.toHaveBeenCalled()
    expect(exploration.start).not.toHaveBeenCalled()
})
