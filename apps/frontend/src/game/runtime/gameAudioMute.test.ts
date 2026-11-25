import {
    CENTER_LOCATION_ID,
    type WorldLocation,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'
import { AudioContextFactory, type Sound, type SoundTrack } from 'excalibur'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { soundCatalog } from '../assets/soundCatalog'
import { characterFixture, worldFixture } from '../testing/characterFixture'
import { isAudioMuted, setAudioMuted } from './audioPreference'
import type { Footstep } from './footsteps'
import { GameAudio } from './gameAudio'
import { setNpcVoiceEnabled } from './npcVoicePreference'
import type { WorldAmbienceSounds } from './worldAmbienceSounds'

const footsteps = vi.hoisted(() => ({
    play: vi.fn<(step: Footstep) => void>(),
    stop: vi.fn<() => void>(),
}))
vi.mock('./footstepAudio', () => ({
    FootstepAudio: class {
        public play = footsteps.play
        public stop = footsteps.stop
    },
}))
function clip(volume: number) {
    let state: 'stopped' | 'playing' | 'paused' = 'stopped'
    const start = () => {
        state = 'playing'
        return Promise.resolve(true)
    }
    return {
        volume,
        get isPlaying() {
            return state === 'playing'
        },
        get isPaused() {
            return state === 'paused'
        },
        get isStopped() {
            return state === 'stopped'
        },
        play: vi.fn<() => Promise<boolean>>(start),
        pause: vi.fn<() => void>(() => {
            state = 'paused'
        }),
        stop: vi.fn<() => void>(() => {
            state = 'stopped'
        }),
    }
}

function musicClip() {
    const track = clip(1)
    return {
        track,
        play: vi.fn<WorldAmbienceSounds['play']>((_, options) => {
            track.volume = options?.volume ?? 1
            void track.play()
            return track as unknown as SoundTrack
        }),
        request: vi.fn<WorldAmbienceSounds['request']>(),
        isReady: (id: string) => id === 'adventureBegins',
    }
}

const footstepsMap = {
    width: 12,
    height: 1,
    tileWidth: 16,
    tileHeight: 16,
    surfaces: Array.from({ length: 12 }, () => 'wood' as const),
}

it('plays a resolved attack cue without replaying an unmarked magic attack or bow windup', () => {
    const { audio, start } = setupEventAudio('attack')
    const actorId = 'hero'
    try {
        audio.playEventSound(
            { kind: 'attack', actorId, abilityId: 'fireball', delivery: 'magic' },
            1
        )
        audio.playEventSound({ kind: 'attack', actorId, abilityId: 'shot', phase: 'started' }, 2)
        expect(start).not.toHaveBeenCalled()
        audio.playEventSound(
            {
                kind: 'attack',
                actorId,
                delivery: 'melee_physical',
                audioCue: {
                    id: 'attack-cue',
                    effect: 'attack',
                    locationId: CENTER_LOCATION_ID,
                    position: { x: 8, y: 8 },
                },
            },
            3
        )
        expect(start).toHaveBeenCalledExactlyOnceWith({ volume: 1 })
    } finally {
        audio.stop()
    }
})

it('keeps inventory feedback personal and plays a bulk chest transfer once', () => {
    const { audio, start } = setupEventAudio('pickup')
    try {
        audio.playEventSound({ kind: 'item_pickup', actorId: 'other' }, 1)
        expect(start).not.toHaveBeenCalled()
        audio.playEventSound({ kind: 'item_pickup', actorId: 'hero' }, 2)
        const take = { kind: 'item_pickup', actorId: 'hero', chestId: 'chest' } as const
        audio.playEventSound(
            {
                ...take,
                audioCue: {
                    id: 'take-cue',
                    effect: 'pickup',
                    locationId: CENTER_LOCATION_ID,
                    position: { x: 8, y: 8 },
                },
            },
            3
        )
        audio.playEventSound(take, 3)
        expect(start.mock.calls).toEqual([[{ volume: 1 }], [{ volume: 1 }]])
    } finally {
        audio.stop()
    }
})

function setupEventAudio(id: 'attack' | 'pickup') {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    const start = vi.fn<Sound['start']>().mockReturnValue(null)
    const sample = { ...clip(soundCatalog[id].volume), start, isLoaded: true }
    const audio = new GameAudio(new Map([[id, sample as unknown as Sound]]))
    audio.setMap(
        { footsteps: { width: 1, height: 1, tileWidth: 16, tileHeight: 16, surfaces: [] } },
        CENTER_LOCATION_ID
    )
    audio.observeWorld(
        { ...snapshot(8), location: { id: CENTER_LOCATION_ID } as WorldLocation },
        'hero'
    )
    return { audio, start }
}

function snapshot(x: number): WorldSnapshot {
    return worldFixture([
        characterFixture('hero', { position: { x, y: 8 }, velocity: { x: 90, y: 0 } }),
    ])
}
beforeEach(() => {
    vi.spyOn(AudioContextFactory, 'create').mockReturnValue({ state: 'running' } as AudioContext)
})
afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    window.history.replaceState({}, '', '/')
    setAudioMuted(false)
    setNpcVoiceEnabled(false)
    window.localStorage.removeItem('ratata:npc-voice-enabled')
    vi.restoreAllMocks()
    vi.clearAllMocks()
})
it.each(['/?test=1', '/?mute=1'])(
    'prevents the first music, event, UI and footstep playback at %s despite a saved audible preference',
    (url) => {
        window.localStorage.setItem('ratata:audio-muted', 'false')
        window.history.replaceState({}, '', url)
        const music = musicClip(),
            effect = clip(0.22)
        const player = new GameAudio(
            new Map([
                ['uiSelect', effect as unknown as Sound],
                ['uiConfirmation', effect as unknown as Sound],
                ['masteryUp', effect as unknown as Sound],
                ['attack', effect as unknown as Sound],
            ]),
            music
        )
        try {
            player.setMap({ footsteps: footstepsMap }, CENTER_LOCATION_ID)
            player.playMusic()
            player.playSound('uiSelect')
            player.playSound('uiConfirmation')
            player.playSound('masteryUp')
            player.playEventSound({ kind: 'attack' })
            player.observeWorld(snapshot(8), 'hero')
            player.observeWorld(snapshot(38), 'hero')
            setAudioMuted(false)
            expect(isAudioMuted()).toBe(true)
            expect(music.request).not.toHaveBeenCalled()
            expect(music.play).not.toHaveBeenCalled()
            expect(effect.play).not.toHaveBeenCalled()
            expect(footsteps.play).not.toHaveBeenCalled()
            expect(window.localStorage.getItem('ratata:audio-muted')).toBe('false')
        } finally {
            player.stop()
        }
    }
)
it('stops all active voices immediately and resumes with authored gains and the current surface map', () => {
    setAudioMuted(false)
    const now = vi.spyOn(performance, 'now').mockReturnValue(0)
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    const music = musicClip(),
        effect = clip(soundCatalog.uiOpen.volume)
    const player = new GameAudio(new Map([['uiOpen', effect as unknown as Sound]]), music)
    try {
        player.setMap({ footsteps: footstepsMap }, CENTER_LOCATION_ID)
        player.playMusic()
        player.playSound('uiOpen')
        player.observeWorld(snapshot(8), 'hero')
        now.mockReturnValue(300)
        player.observeWorld(snapshot(38), 'hero')
        expect(footsteps.play).toHaveBeenCalledOnce()
        footsteps.stop.mockClear()
        setAudioMuted(true)
        setAudioMuted(true)
        expect(music.track.stop).toHaveBeenCalledOnce()
        expect(effect.stop).toHaveBeenCalledOnce()
        expect(footsteps.stop).toHaveBeenCalledOnce()
        player.playSound('uiOpen')
        now.mockReturnValue(600)
        player.observeWorld(snapshot(68), 'hero')
        expect(effect.play).toHaveBeenCalledOnce()
        expect(footsteps.play).toHaveBeenCalledOnce()
        setAudioMuted(false)
        expect(music.play).toHaveBeenCalledTimes(2)
        expect(music.play).toHaveBeenLastCalledWith('adventureBegins', { loop: true, volume: 1 })
        expect(effect.volume).toBe(soundCatalog.uiOpen.volume)
        player.observeWorld(snapshot(68), 'hero')
        now.mockReturnValue(900)
        player.observeWorld(snapshot(98), 'hero')
        expect(footsteps.play).toHaveBeenCalledTimes(2)
        expect(footsteps.play).toHaveBeenLastCalledWith(
            expect.objectContaining({ surface: 'wood' })
        )
        player.stop()
        setAudioMuted(true)
        setAudioMuted(false)
        expect(music.play).toHaveBeenCalledTimes(2)
    } finally {
        player.stop()
    }
})
it('resumes a paused music track once and waits for visibility when unmuted while hidden', () => {
    setAudioMuted(false)
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    const music = musicClip()
    const player = new GameAudio(new Map(), music)
    player.setMap({ footsteps: footstepsMap }, CENTER_LOCATION_ID)
    const changeVisibility = (value: boolean) => {
        hidden.mockReturnValue(value)
        document.dispatchEvent(new Event('visibilitychange'))
    }

    try {
        player.playMusic()
        setAudioMuted(false)
        player.playMusic()
        expect(music.play).toHaveBeenCalledOnce()
        changeVisibility(true)
        changeVisibility(true)
        expect(music.track.pause).toHaveBeenCalledOnce()
        setAudioMuted(false)
        player.playMusic()
        expect(music.track.play).toHaveBeenCalledOnce()
        expect(music.play).toHaveBeenCalledOnce()

        changeVisibility(false)
        setAudioMuted(false)
        changeVisibility(false)
        expect(music.track.play).toHaveBeenCalledTimes(2)
        expect(music.play).toHaveBeenCalledOnce()

        changeVisibility(true)
        setAudioMuted(true)
        setAudioMuted(false)
        expect(music.track.stop).toHaveBeenCalledOnce()
        expect(music.play).toHaveBeenCalledOnce()
        changeVisibility(false)
        expect(music.play).toHaveBeenCalledTimes(2)
        expect(music.track.play).toHaveBeenCalledTimes(3)

        player.stop()
        player.stop()
        player.playMusic()
        changeVisibility(false)
        expect(music.track.stop).toHaveBeenCalledTimes(2)
        expect(music.play).toHaveBeenCalledTimes(2)
    } finally {
        player.stop()
    }
})
it('forces silence from the automated browser build flag before music playback', () => {
    vi.stubEnv('VITE_GAME_AUDIO_MUTED', '1')
    const music = musicClip()
    const player = new GameAudio(new Map(), music)
    player.setMap({ footsteps: footstepsMap }, CENTER_LOCATION_ID)
    try {
        player.playMusic()
        expect(music.request).not.toHaveBeenCalled()
        expect(music.play).not.toHaveBeenCalled()
        expect(isAudioMuted()).toBe(true)
    } finally {
        player.stop()
    }
})

it('plays live NPC speech by default and honors voice and master mute controls', () => {
    setAudioMuted(false)
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    const speech = Object.assign(new EventTarget(), {
        getVoices: () => [{ voiceURI: 'ru', lang: 'ru-RU', localService: true }],
        speak: vi.fn<(utterance: { text: string; volume: number }) => void>(),
        cancel: vi.fn<() => void>(),
    })
    vi.stubGlobal('speechSynthesis', speech)
    vi.stubGlobal(
        'SpeechSynthesisUtterance',
        class {
            public constructor(public readonly text: string) {}
        }
    )
    const player = new GameAudio(new Map())
    player.setMap({
        footsteps: { width: 1, height: 1, tileWidth: 16, tileHeight: 16, surfaces: [] },
    })
    player.observeWorld(
        {
            ...worldFixture([
                characterFixture('hero'),
                characterFixture('npc', { controllerKind: 'scripted', position: { x: 80, y: 0 } }),
            ]),
            location: { id: CENTER_LOCATION_ID } as WorldLocation,
        },
        'hero'
    )
    const say = (speechId: number) =>
        player.playEventSound({
            kind: 'chat',
            actorId: 'npc',
            locationId: CENTER_LOCATION_ID,
            speechId,
            text: 'Привет!',
            voice: 'ambient',
        })

    try {
        say(1)
        expect(speech.speak).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ text: 'Привет!', volume: 0.03 })
        )
        setAudioMuted(true)
        expect(speech.cancel).toHaveBeenCalledOnce()
        say(2)
        expect(speech.speak).toHaveBeenCalledOnce()

        setAudioMuted(false)
        say(3)
        expect(speech.speak).toHaveBeenCalledTimes(2)
        setNpcVoiceEnabled(false)
        expect(speech.cancel).toHaveBeenCalledTimes(2)
        say(4)
        expect(speech.speak).toHaveBeenCalledTimes(2)
    } finally {
        player.stop()
    }
})
