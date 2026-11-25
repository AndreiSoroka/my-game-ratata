import {
    CENTER_LOCATION_ID,
    WESTERN_RUINS_LOCATION_ID,
    WORLD_SOUND_RADII,
    type WorldLocation,
} from '@my-game-ratata/contracts'
import { DefaultLoader, Sound, type SoundTrack } from 'excalibur'

import { type GameSoundId, musicCatalog, soundCatalog } from '../../src/game/assets/soundCatalog'
import { isAudioMuteForced, setAudioMuted } from '../../src/game/runtime/audioPreference'
import { createCharacterResources } from '../../src/game/runtime/characterResources'
import { FootstepAudio } from '../../src/game/runtime/footstepAudio'
import { GameAudio } from '../../src/game/runtime/gameAudio'
import { WorldAmbienceSounds } from '../../src/game/runtime/worldAmbienceSounds'
import { characterFixture, worldFixture } from '../../src/game/testing/characterFixture'
import { mountEngine, startEngine, waitForEngine } from './engineSupport'

const step = { actorId: 'walker', surface: 'grass', volume: 0.8, variant: 0, slime: false } as const
const map = { footsteps: { width: 32, height: 32, tileWidth: 16, tileHeight: 16, surfaces: [] } }
const listener = characterFixture('listener', { position: { x: 24, y: 24 } })
const world = {
    ...worldFixture([listener]),
    location: { id: CENTER_LOCATION_ID } as WorldLocation,
    viewBounds: { left: 0, top: 0, right: 64, bottom: 64 },
}

export async function verifyAudio(context: AudioContext) {
    const run = mountEngine()
    const resources = createCharacterResources()
    const other = createCharacterResources()
    const sample = resources.sounds.get('stepGrass0')
    if (!sample) throw new Error('Footstep sample is missing')
    const menuOpen = resources.sounds.get('uiOpen')
    const bookClose = resources.sounds.get('uiBookClose')
    const slotSelect = resources.sounds.get('uiSlotSelect')
    const equipment = resources.sounds.get('equip')
    const chest = resources.sounds.get('chestOpen')
    const bell = resources.sounds.get('bell')
    const knock = resources.sounds.get('doorKnock')
    if (!menuOpen || !bookClose || !slotSelect || !equipment)
        throw new Error('Interface sample is missing')
    if (!chest || !bell || !knock) throw new Error('World sample is missing')
    const music = new Sound(musicCatalog.adventureBegins.src)
    const loader = new DefaultLoader({
        loadables: [sample, menuOpen, bookClose, slotSelect, equipment, chest, bell, knock, music],
    })
    let audioBeforeLoad: AudioContextState | undefined
    loader.on('beforeload', () => {
        audioBeforeLoad = context.state
    })
    const bank = new WorldAmbienceSounds((src, signal) => {
        if (src === musicCatalog.adventureBegins.src) return Promise.resolve(music)
        return Promise.reject(signal.reason ?? new Error(`Unexpected probe soundtrack ${src}`))
    })
    const gameAudio = new GameAudio(resources.sounds, bank)
    run.owner.addCleanup(() => bank.dispose())
    run.owner.addCleanup(() => gameAudio.stop())
    try {
        await startEngine(run, loader)
        gameAudio.setMap(map, CENTER_LOCATION_ID)
        gameAudio.observeWorld(world, listener.id, () => false)
        const worldSounds = checkWorldSounds(gameAudio, chest, bell, knock)
        gameAudio.setMap(map, CENTER_LOCATION_ID)
        gameAudio.observeWorld(world, listener.id, () => false)
        gameAudio.playMusic()
        await waitForEngine(run, () => bank.isReady('adventureBegins'))
        return {
            audioBeforeLoad,
            forcedMute: isAudioMuteForced(),
            independentSounds: sample !== other.sounds.get('stepGrass0'),
            sampleVolume: sample.output.gain.value,
            catalogVolume: soundCatalog.stepGrass0.volume,
            musicVolume: music.output.gain.value,
            menuOpen: checkPlayback(menuOpen, () => gameAudio.playSound('uiOpen')),
            bookClose: checkPlayback(bookClose, () => gameAudio.playSound('uiBookClose')),
            slotSelect: checkPlayback(slotSelect, () => gameAudio.playSound('uiSlotSelect')),
            equipment: checkPlayback(equipment, () =>
                gameAudio.playEventSound(
                    { kind: 'item_equip', actorId: listener.id },
                    world.serverTime
                )
            ),
            worldSounds,
            footsteps: await checkFootsteps(sample),
            music: checkMusic(gameAudio, music),
        }
    } finally {
        await run.owner.cancel()
    }
}

function checkPlayback(sample: Sound, play: () => void) {
    play()
    const result = {
        path: sample.path,
        duration: sample.data.duration,
        tracks: sample.playingCount(),
    }
    sample.stop()
    return result
}

function checkWorldSounds(audio: GameAudio, chest: Sound, bell: Sound, knock: Sound) {
    const open = (
        id: string,
        distance: number,
        obstructed?: true,
        locationId = CENTER_LOCATION_ID
    ) =>
        audio.playEventSound(
            {
                kind: 'chest_open',
                audioCue: {
                    id,
                    effect: 'chestOpen',
                    locationId,
                    position: { x: listener.position.x + distance, y: listener.position.y },
                    ...(obstructed ? { obstructed } : {}),
                },
            },
            world.serverTime
        )
    const halfRadius = WORLD_SOUND_RADII.chestOpen / 2
    open('near', 0)
    open('outside-viewport', halfRadius)
    open('behind-wall', halfRadius, true)
    const volumes = chest.instances.map((track) => track.volume)
    open('behind-wall', halfRadius, true)
    open('beyond-range', WORLD_SOUND_RADII.chestOpen + 1)
    open('other-map', 0, undefined, WESTERN_RUINS_LOCATION_ID)
    audio.observeWorld(world, listener.id, () => false)
    const afterIgnored = chest.playingCount()
    setAudioMuted(true)
    const afterMute = chest.playingCount()
    setAudioMuted(false)
    open('before-hide', 0)
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
    open('while-hidden', 0)
    const afterHide = chest.playingCount()
    Reflect.deleteProperty(document, 'hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    open('before-travel', 0)
    const beforeTravel = chest.playingCount()
    audio.setMap(map, WESTERN_RUINS_LOCATION_ID)
    return {
        volumes,
        afterIgnored,
        afterMute,
        afterHide,
        beforeTravel,
        afterTravel: chest.playingCount(),
        bellDuration: bell.data.duration,
        knockDuration: knock.data.duration,
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
        const muted = music.playingCount()
        setAudioMuted(false)
        setAudioMuted(false)
        const unmuted = {
            same: first === music.instances.find((track) => track.isPlaying),
            count: music.playingCount(),
        }
        return { firstCount, hidden, resumed, muted, unmuted }
    } finally {
        Reflect.deleteProperty(document, 'hidden')
        Reflect.deleteProperty(document, 'visibilityState')
    }
}
