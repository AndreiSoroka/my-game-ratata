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
    const forest = clip()
    const battle = clip()
    const exploration = {
        start: vi.fn<Sound['start']>((options) => startClip(regular, options?.volume)),
    }
    const bank = {
        request: vi.fn<WorldAmbienceSounds['request']>(),
        isReady: vi.fn<WorldAmbienceSounds['isReady']>(() => true),
        play: vi.fn<WorldAmbienceSounds['play']>((id, options) => {
            if (id === 'adventureBegins') return exploration.start(options) ?? undefined
            return startClip(id === 'forestBattle' ? battle : forest, options?.volume)
        }),
    }
    const running = vi.fn<() => boolean>(() => true)
    const music = new GameMusic(bank, running)
    music.setProfile({ exploration: 'adventureBegins', battle: 'forestBattle' })
    return { music, regular, forest, battle, exploration, bank, running }
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

    expect(bank.play).toHaveBeenNthCalledWith(2, 'forestBattle', { loop: true, volume: 0 })
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
    expect(bank.play).toHaveBeenCalledTimes(2)
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
})

it('keeps exploration at full volume until the optional track is ready and audio is running', () => {
    const { music, regular, battle, bank, running } = setup()
    bank.isReady.mockImplementation((id) => id === 'adventureBegins')
    music.start()
    running.mockReturnValue(false)
    music.setBattle(true)
    music.update(750)
    bank.isReady.mockReturnValue(true)
    music.update(750)

    expect(bank.request.mock.calls).toEqual([['adventureBegins'], ['forestBattle']])
    expect(regular.isPlaying).toBe(true)
    expect(regular.volume).toBe(1)
    expect(bank.play).toHaveBeenCalledExactlyOnceWith('adventureBegins', { loop: true, volume: 1 })

    running.mockReturnValue(true)
    music.update(0)
    expect(battle.playedAtVolumes).toEqual([0])
    expect(regular.volume).toBe(1)
    music.update(750)
    expect(battle.volume).toBeCloseTo(Math.SQRT1_2)
})

it('ignores a clip that loads after the battle has ended', () => {
    const { music, regular, bank } = setup()
    bank.isReady.mockImplementation((id) => id === 'adventureBegins')
    music.start()
    music.setBattle(true)
    music.setBattle(false)
    bank.isReady.mockReturnValue(true)
    music.update(3000)

    expect(bank.play).toHaveBeenCalledExactlyOnceWith('adventureBegins', { loop: true, volume: 1 })
    expect(regular.isPlaying).toBe(true)
    expect(regular.volume).toBe(1)
})

it('keeps exploration at full volume if battle playback fails to start', () => {
    const { music, regular, bank } = setup()
    music.start()
    bank.play.mockReturnValueOnce(undefined)
    music.setBattle(true)
    music.update(2000)

    expect(regular.isPlaying).toBe(true)
    expect(regular.volume).toBe(1)
    expect(bank.play).toHaveBeenCalledTimes(2)

    music.setBattle(false)
    music.setBattle(true)
    expect(bank.play).toHaveBeenCalledTimes(3)
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
    expect(bank.play).toHaveBeenCalledTimes(2)
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
    expect(bank.play).toHaveBeenCalledTimes(3)
})

it('does not prepare or play music in forced silence or after disposal', () => {
    window.history.replaceState({}, '', '/?test=1')
    const { music, exploration, bank } = setup()
    music.setBattle(true)
    music.start()
    music.update(750)
    expect(bank.request).not.toHaveBeenCalled()
    expect(bank.play).not.toHaveBeenCalled()
    expect(exploration.start).not.toHaveBeenCalled()

    music.dispose()
    window.history.replaceState({}, '', '/')
    music.setProfile({ exploration: 'forestExploration', battle: 'forestBattle' })
    music.resume()
    music.update(750)
    expect(bank.request).not.toHaveBeenCalled()
    expect(bank.play).not.toHaveBeenCalled()
    expect(exploration.start).not.toHaveBeenCalled()
})

it('starts only the selected exploration track after loading and preserves it across profiles', () => {
    const { music, regular, forest, bank } = setup()
    bank.isReady.mockReturnValue(false)
    music.start()
    music.setProfile({ exploration: 'forestExploration', battle: 'forestBattle' })
    expect(bank.play).not.toHaveBeenCalled()

    bank.isReady.mockReturnValue(true)
    music.update(16)
    expect(forest.isPlaying).toBe(true)
    expect(regular.isPlaying).toBe(false)
    expect(bank.play).toHaveBeenCalledExactlyOnceWith('forestExploration', {
        loop: true,
        volume: 1,
    })

    music.setProfile({ exploration: 'forestExploration', battle: null })
    expect(forest.isPlaying).toBe(true)
    expect(forest.stop).not.toHaveBeenCalled()
    expect(forest.play).toHaveBeenCalledOnce()

    music.setProfile({ exploration: null, battle: null })
    music.setBattle(true)
    music.update(16)
    expect(forest.isStopped).toBe(true)
    expect(bank.play).toHaveBeenCalledOnce()
})

it('plays only the battle track when the exploration theme is silent', () => {
    const { music, regular, battle, bank } = setup()
    music.setProfile({ exploration: null, battle: 'forestBattle' })
    music.start()
    expect(bank.play).not.toHaveBeenCalled()

    music.setBattle(true)
    music.update(1500)
    expect(battle.isPlaying).toBe(true)
    expect(battle.volume).toBe(1)
    music.setBattle(false)
    music.update(2500)
    expect(battle.volume).toBe(0)
    music.update(300)
    expect(battle.isStopped).toBe(true)
    expect(regular.play).not.toHaveBeenCalled()
})

it('fades to silence during battle when the battle theme is explicitly disabled', () => {
    const { music, regular, bank } = setup()
    music.setProfile({ exploration: 'adventureBegins', battle: null })
    music.start()

    music.setBattle(true)
    music.update(1500)
    expect(regular.volume).toBe(0)
    music.update(300)
    expect(regular.isPaused).toBe(true)

    music.setBattle(false)
    music.update(2500)
    expect(regular.volume).toBe(1)
    expect(regular.isPlaying).toBe(true)
    expect(bank.play).toHaveBeenCalledOnce()
})

it('keeps a single loop when both phases select the same theme', () => {
    const { music, regular, bank } = setup()
    music.setProfile({ exploration: 'adventureBegins', battle: 'adventureBegins' })
    music.start()
    music.setBattle(true)
    music.update(1500)
    music.setBattle(false)
    music.update(2500)
    expect(regular.volume).toBe(1)
    expect(regular.isPlaying).toBe(true)
    expect(bank.request).toHaveBeenCalledExactlyOnceWith('adventureBegins')
    expect(bank.play).toHaveBeenCalledOnce()
})
