import { DefaultLoader, type Sound, type SoundTrack } from 'excalibur'

import { type GameSoundId, soundCatalog } from '../../src/game/assets/soundCatalog'
import { isAudioMuteForced, setAudioMuted } from '../../src/game/runtime/audioPreference'
import { createCharacterResources } from '../../src/game/runtime/characterResources'
import { FootstepAudio } from '../../src/game/runtime/footstepAudio'
import { GameAudio } from '../../src/game/runtime/gameAudio'
import { mountEngine, startEngine } from './engineSupport'

const step = { actorId: 'walker', surface: 'grass', volume: 0.8, variant: 0, slime: false } as const

export async function verifyAudio(context: AudioContext) {
    const run = mountEngine()
    const resources = createCharacterResources()
    const other = createCharacterResources()
    const sample = resources.sounds.get('stepGrass0')
    if (!sample) throw new Error('Footstep sample is missing')
    const music = resources.music.adventureBegins
    const loader = new DefaultLoader({ loadables: [sample, music] })
    let audioBeforeLoad: AudioContextState | undefined
    loader.on('beforeload', () => {
        audioBeforeLoad = context.state
    })
    const gameAudio = new GameAudio(resources.sounds, music)
    run.owner.addCleanup(() => gameAudio.stop())
    try {
        await startEngine(run, loader)
        return {
            audioBeforeLoad,
            forcedMute: isAudioMuteForced(),
            independentSounds:
                sample !== other.sounds.get('stepGrass0') && music !== other.music.adventureBegins,
            sampleVolume: sample.output.gain.value,
            catalogVolume: soundCatalog.stepGrass0.volume,
            footsteps: await checkFootsteps(sample),
            music: checkMusic(gameAudio, music),
        }
    } finally {
        await run.owner.cancel()
    }
}

async function checkFootsteps(sample: Sound) {
    const footsteps = new FootstepAudio(
        new Map<GameSoundId, Sound>([
            ['stepGrass0', sample],
            ['stepGrass1', sample],
        ])
    )
    const external = sample.start({ loop: true, volume: 0.25, playbackRate: 1.2 })
    if (!external) throw new Error('Independent track did not start')
    try {
        footsteps.play(step)
        for (let i = 0; i < 10; i++) {
            footsteps.play({ ...step, surface: 'dirt', volume: 0.4, variant: 1 })
        }
        const owned = sample.instances.filter((track) => track !== external)
        const settings = owned.slice(0, 2).map((track) => [track.volume, track.playbackRate])
        const completed = await waitForAudio(owned)
        footsteps.play(step)
        const afterCompletion = sample.playingCount()
        footsteps.stop()
        footsteps.stop()
        return {
            voices: owned.length,
            settings,
            completed,
            afterCompletion,
            afterStop: sample.playingCount(),
            external: [external.isPlaying, external.volume, external.playbackRate],
        }
    } finally {
        footsteps.stop()
        external.stop()
    }
}

async function waitForAudio(tracks: SoundTrack[]): Promise<boolean[]> {
    let timer: number | undefined
    try {
        return await Promise.race([
            Promise.all(tracks.map((track) => track.done)),
            new Promise<never>((_, reject) => {
                timer = window.setTimeout(
                    () => reject(new Error('Footsteps did not finish')),
                    5_000
                )
            }),
        ])
    } finally {
        window.clearTimeout(timer)
    }
}

function checkMusic(audio: GameAudio, music: Sound) {
    function visibility(hidden: boolean) {
        // Headless Chromium keeps pages visible. Exercise the real listeners for both states.
        Object.defineProperty(document, 'hidden', { configurable: true, value: hidden })
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: hidden ? 'hidden' : 'visible',
        })
        document.dispatchEvent(new Event('visibilitychange'))
    }
    try {
        audio.playMusic()
        setAudioMuted(false)
        setAudioMuted(false)
        const first = music.instances[0]
        const firstCount = music.playingCount()

        visibility(true)
        audio.playMusic()
        setAudioMuted(false)
        const hidden = { paused: music.isPaused, count: music.instanceCount() }
        visibility(false)
        const resumed = { same: first === music.instances[0], count: music.playingCount() }

        setAudioMuted(true)
        setAudioMuted(true)
        const muted = music.instanceCount()
        setAudioMuted(false)
        setAudioMuted(false)
        const unmuted = { same: first === music.instances[0], count: music.playingCount() }
        return { firstCount, hidden, resumed, muted, unmuted }
    } finally {
        Reflect.deleteProperty(document, 'hidden')
        Reflect.deleteProperty(document, 'visibilityState')
    }
}
