import { CENTER_LOCATION_ID, type WorldLocation } from '@my-game-ratata/contracts'
import { Future, Sound } from 'excalibur'

import { isAudioMuteForced, setAudioMuted } from '../../src/game/runtime/audioPreference'
import { CastAudio } from '../../src/game/runtime/castAudio'
import { GameAudio } from '../../src/game/runtime/gameAudio'
import { HumanDeathAudio } from '../../src/game/runtime/humanDeathAudio'
import { WorldAmbience } from '../../src/game/runtime/worldAmbience'
import { WorldAmbienceSounds } from '../../src/game/runtime/worldAmbienceSounds'
import { characterFixture, worldFixture } from '../../src/game/testing/characterFixture'
import { mountEngine, startEngine, stepUntil } from './engineSupport'

const actorId = 'hero'
const prayerId = 'praying-neighbor'
const magicFile = 'magic-cast.mp3'
const prayerFile = 'prayer-whisper.mp3'
const waterFile = 'water-shore.wav'
const deathFile = 'human-death.mp3'
const expectedClips = [magicFile, prayerFile, waterFile, deathFile]
const tileWidth = 16
const tileHeight = 16
const mapSize = 24
const serverTime = 100_000
const spark = {
    kind: 'attack',
    abilityId: 'spark',
    delivery: 'magic',
    actorId,
    actionId: 'spark-1',
} as const

export async function verifyCastAndWaterAudio(context: AudioContext) {
    const run = mountEngine()
    const clips = new Map<string, Sound>()
    const decoded = new Future<void>()
    let requests = 0
    const bank = new WorldAmbienceSounds(async (src, signal) => {
        requests += 1
        const response = await fetch(src, { signal })
        if (!response.ok) throw new Error(`Could not load ${src}`)
        const sound = await Sound.fromBlob(await response.blob())
        clips.set(src.slice(src.lastIndexOf('/') + 1), sound)
        if (expectedClips.every((file) => clips.has(file))) decoded.resolve()
        return sound
    })
    const ambience = new WorldAmbience(run.engine, { sounds: bank, audioContext: () => context })
    const casts = new CastAudio(bank, { audioRunning: () => context.state === 'running' })
    const deaths = new HumanDeathAudio(bank, () => context.state === 'running')
    const audio = new GameAudio(new Map(), new Sound(), ambience, { casts, deaths })
    const updateCasts = () => casts.update()
    run.engine.on('postupdate', updateCasts)
    run.owner.addCleanup(() => {
        run.engine.off('postupdate', updateCasts)
        audio.stop()
        bank.dispose()
    })

    try {
        await startEngine(run)
        audio.setMap(shoreMap(), CENTER_LOCATION_ID)
        audio.startWorldAmbience()
        const world = shorelineSnapshot()
        const observe = () =>
            audio.observeWorld(
                world,
                actorId,
                () => true,
                () => true
            )
        observe()
        run.clock.step(16)
        if (isAudioMuteForced()) {
            run.clock.step(16)
            return { requests, sounds: clips.size }
        }
        await stepUntil(decoded.promise, run.clock)
        run.clock.step(16)
        return { requests, ...exerciseWorldCues(audio, clips, observe, () => run.clock.step(16)) }
    } finally {
        await run.owner.cancel()
        setAudioMuted(false)
    }
}

function exerciseWorldCues(
    audio: GameAudio,
    clips: Map<string, Sound>,
    observe: () => void,
    step: () => void
) {
    const [magic, prayer, water, death] = expectedClips.map((file) => clips.get(file)!) as [
        Sound,
        Sound,
        Sound,
        Sound,
    ]
    audio.playEventSound(spark, serverTime)
    audio.playEventSound(spark, serverTime)
    const playing = [magic, prayer, water].map((sound) => sound.playingCount())
    const tracks = [magic, prayer, water].map((sound) => sound.instances[0]!)

    audio.playEventSound(
        { kind: 'cast', phase: 'interrupted', actorId: prayerId, abilityId: 'pray' },
        serverTime + 100
    )
    observe()
    step()
    const stalePrayerStopped = tracks[1]?.isStopped && prayer.playingCount() === 0

    audio.playEventSound({ kind: 'death', targetId: actorId }, serverTime + 200)
    const deathVoice = death.instances[0]
    audio.invalidateWorld(true)
    const deathVoiceSurvivesInvalidation = deathVoice?.isPlaying
    setAudioMuted(true)
    return {
        playing,
        waterLoop: tracks[2]?.loop,
        stoppedOnMute: deathVoice?.isStopped && tracks.every((track) => track.isStopped),
        stalePrayerStopped,
        deathVoiceSurvivesInvalidation,
        durations: [magic, prayer, water, death].map((sound) => sound.data.duration),
    }
}

function shoreMap() {
    const water = new Uint8Array(mapSize * mapSize)
    water[5 * mapSize + 5] = 1
    return {
        footsteps: { tileWidth, tileHeight, width: mapSize, height: mapSize, surfaces: [] },
        buildings: [],
        ambientTerrain: { width: mapSize, height: mapSize, water, fortifications: [] },
    }
}

function shorelineSnapshot() {
    const local = characterFixture(actorId, { position: { x: 64, y: 88 } })
    const neighbor = characterFixture(prayerId, {
        position: { x: 96, y: 88 },
        abilities: {
            known: ['pray'],
            cooldowns: {},
            barrier: null,
            casting: {
                abilityId: 'pray',
                targetId: prayerId,
                startedAt: serverTime - 50,
                completesAt: serverTime + 10_000,
            },
        },
    })
    return {
        ...worldFixture([local, neighbor], serverTime),
        location: { id: CENTER_LOCATION_ID, biome: 'city' } as WorldLocation,
    }
}
