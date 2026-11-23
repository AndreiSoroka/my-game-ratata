import {
    CENTER_LOCATION_ID,
    type WorldLocation,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'
import type { Sound } from 'excalibur'
import { afterEach, expect, it, vi } from 'vitest'

import { soundCatalog } from '../assets/soundCatalog'
import { characterFixture, worldFixture } from '../testing/characterFixture'
import { isAudioMuted, setAudioMuted } from './audioPreference'
import type { Footstep } from './footsteps'
import { GameAudio } from './gameAudio'
import { setNpcVoiceEnabled } from './npcVoicePreference'

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
    return {
        volume,
        play: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
        stop: vi.fn<() => void>(),
    }
}
function snapshot(x: number): WorldSnapshot {
    return worldFixture([
        characterFixture('hero', { position: { x, y: 8 }, velocity: { x: 90, y: 0 } }),
    ])
}
afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    window.history.replaceState({}, '', '/')
    setAudioMuted(false)
    setNpcVoiceEnabled(false)
    vi.restoreAllMocks()
    vi.clearAllMocks()
})
it.each(['/?test=1', '/?mute=1'])(
    'prevents the first music, event, UI and footstep playback at %s despite a saved audible preference',
    (url) => {
        window.localStorage.setItem('ratata:audio-muted', 'false')
        window.history.replaceState({}, '', url)
        const music = clip(0.18),
            effect = clip(0.22)
        const player = new GameAudio(
            new Map([
                ['uiSelect', effect as unknown as Sound],
                ['uiConfirmation', effect as unknown as Sound],
                ['masteryUp', effect as unknown as Sound],
                ['attack', effect as unknown as Sound],
            ]),
            music as unknown as Sound
        )
        try {
            player.setMap({
                footsteps: {
                    width: 12,
                    height: 1,
                    tileWidth: 16,
                    tileHeight: 16,
                    surfaces: Array.from({ length: 12 }, () => 'wood'),
                },
            })
            player.playMusic()
            player.playSound('uiSelect')
            player.playSound('uiConfirmation')
            player.playSound('masteryUp')
            player.playEventSound({ kind: 'attack' })
            player.observeWorld(snapshot(8), 'hero')
            player.observeWorld(snapshot(38), 'hero')
            setAudioMuted(false)
            expect(isAudioMuted()).toBe(true)
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
    const music = clip(0.18),
        effect = clip(soundCatalog.uiOpen.volume)
    const player = new GameAudio(
        new Map([['uiOpen', effect as unknown as Sound]]),
        music as unknown as Sound
    )
    try {
        player.setMap({
            footsteps: {
                width: 12,
                height: 1,
                tileWidth: 16,
                tileHeight: 16,
                surfaces: Array.from({ length: 12 }, () => 'wood'),
            },
        })
        player.playMusic()
        player.playSound('uiOpen')
        player.observeWorld(snapshot(8), 'hero')
        now.mockReturnValue(300)
        player.observeWorld(snapshot(38), 'hero')
        expect(footsteps.play).toHaveBeenCalledOnce()
        footsteps.stop.mockClear()
        setAudioMuted(true)
        expect(music.stop).toHaveBeenCalledOnce()
        expect(effect.stop).toHaveBeenCalledOnce()
        expect(footsteps.stop).toHaveBeenCalledOnce()
        player.playSound('uiOpen')
        now.mockReturnValue(600)
        player.observeWorld(snapshot(68), 'hero')
        expect(effect.play).toHaveBeenCalledOnce()
        expect(footsteps.play).toHaveBeenCalledOnce()
        setAudioMuted(false)
        expect(music.play).toHaveBeenCalledTimes(2)
        expect(music.volume).toBe(0.18)
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
it('forces silence from the automated browser build flag before music playback', () => {
    vi.stubEnv('VITE_GAME_AUDIO_MUTED', '1')
    const music = clip(0.18)
    const player = new GameAudio(new Map(), music as unknown as Sound)
    try {
        player.playMusic()
        expect(music.play).not.toHaveBeenCalled()
        expect(isAudioMuted()).toBe(true)
    } finally {
        player.stop()
    }
})

it('honors both voice and master audio controls for live NPC speech', () => {
    setAudioMuted(false)
    setNpcVoiceEnabled(false)
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
    const player = new GameAudio(new Map(), clip(0.18) as unknown as Sound)
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
        expect(speech.speak).not.toHaveBeenCalled()
        setNpcVoiceEnabled(true)
        say(2)
        setAudioMuted(true)
        expect(speech.cancel).toHaveBeenCalledOnce()
        say(3)
        setAudioMuted(false)
        expect(speech.speak).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ text: 'Привет!', volume: 0.03 })
        )

        say(4)
        setNpcVoiceEnabled(false)
        expect(speech.cancel).toHaveBeenCalledTimes(2)
        say(5)
        expect(speech.speak).toHaveBeenCalledTimes(2)
    } finally {
        player.stop()
    }
})
