import {
    CENTER_LOCATION_ID,
    type CharacterAbilitiesSnapshot,
    type MagicChannelSnapshot,
    type WorldLocation,
} from '@my-game-ratata/contracts'
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
const sparkFile = 'spark-flight.mp3'
const magicFile = 'magic-cast.mp3'
const prayerFile = 'prayer-whisper.mp3'
const waterFile = 'water-shore.wav'
const deathFile = 'human-death.mp3'
const expectedClips = [sparkFile, magicFile, prayerFile, waterFile, deathFile] as const
const tileWidth = 16
const tileHeight = 16
const mapSize = 24
const serverTime = 100_000
type AshCast = NonNullable<CharacterAbilitiesSnapshot['ashCasting']>
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
    const casts = new CastAudio(bank, {
        now: () => run.clock.now(),
        audioRunning: () => context.state === 'running',
    })
    const deaths = new HumanDeathAudio(bank, () => context.state === 'running')
    const audio = new GameAudio(new Map(), undefined, ambience, { casts, deaths })
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
        const observe: ObserveCastWorld = (at = serverTime, channel, ashCasting) =>
            audio.observeWorld(
                shorelineSnapshot(at, channel, ashCasting),
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
        return {
            requests,
            ...exerciseWorldCues(audio, clips, observe, (ms = 16) => run.clock.step(ms)),
        }
    } finally {
        await run.owner.cancel()
        setAudioMuted(false)
    }
}

type ObserveCastWorld = (
    serverTime?: number,
    channel?: MagicChannelSnapshot,
    ashCasting?: AshCast
) => void

function exerciseWorldCues(
    audio: GameAudio,
    clips: Map<string, Sound>,
    observe: ObserveCastWorld,
    step: (ms?: number) => void
) {
    const [sparkFlight, magic, prayer, water, death] = expectedClips.map((file) =>
        clips.get(file)!
    ) as [Sound, Sound, Sound, Sound, Sound]
    const sparkCues = exerciseSparkCues(audio, magic, sparkFlight)
    const playing = [sparkFlight, prayer, water].map((sound) => sound.playingCount())
    const tracks = [sparkFlight, prayer, water].map((sound) => sound.instances[0]!)
    const whisperGains = [magic, prayer].map((sound) => sound.output.gain.value)

    audio.playEventSound(
        { kind: 'cast', phase: 'interrupted', actorId: prayerId, abilityId: 'pray' },
        serverTime + 100
    )
    observe()
    step()
    const stalePrayerStopped = tracks[1]?.isStopped && prayer.playingCount() === 0

    tracks[0]?.stop()
    const magicChannels = exerciseMagicChannels(audio, magic, observe, step)
    const ashCurse = exerciseAshCurse(audio, sparkFlight, prayer, observe)

    audio.playEventSound({ kind: 'death', targetId: actorId }, serverTime + 6200)
    const deathVoice = death.instances[0]
    audio.invalidateWorld(true)
    const deathVoiceSurvivesInvalidation = deathVoice?.isPlaying
    setAudioMuted(true)
    return {
        playing,
        waterLoop: tracks[2]?.loop,
        stoppedOnMute: deathVoice?.isStopped && tracks.every((track) => track.isStopped),
        stalePrayerStopped,
        ...sparkCues,
        whisperGains,
        instantOneShot: tracks[0]?.loop === false,
        prayerOneShot: tracks[1]?.loop === false,
        magicChannels,
        ashCurse,
        deathVoiceSurvivesInvalidation,
        durations: [sparkFlight, magic, prayer, water, death].map((sound) => sound.data.duration),
    }
}

function exerciseSparkCues(audio: GameAudio, magic: Sound, sparkFlight: Sound) {
    const started = { ...spark, phase: 'started' } as const
    audio.playEventSound(started, serverTime)
    audio.playEventSound(started, serverTime)
    const sparkWhisper = magic.instances.find((track) => track.isPlaying)
    const castWhispersOnce = magic.playingCount() === 1 && sparkWhisper?.loop === false
    const noWindupBuzz = sparkFlight.playingCount() === 0
    const released = {
        ...spark,
        phase: 'completed',
        projectile: { origin: { x: 64, y: 88 }, endpoint: { x: 144, y: 88 } },
    } as const
    audio.playEventSound(released, serverTime + 100)
    audio.playEventSound(released, serverTime + 100)
    return {
        castWhispersOnce,
        noWindupBuzz,
        sparkWhisperStopsAtRelease: sparkWhisper?.isStopped && magic.playingCount() === 0,
    }
}

function exerciseAshCurse(
    audio: GameAudio,
    sparkFlight: Sound,
    prayer: Sound,
    observe: ObserveCastWorld
) {
    const ashCasting: AshCast = {
        abilityId: 'ash_exhaustion',
        targetId: actorId,
        startedAt: serverTime + 4000,
        completesAt: serverTime + 6000,
    }
    observe(serverTime + 4100, undefined, ashCasting)
    const whisper = prayer.instances.find((track) => track.isPlaying)
    const noFlightBeforeRelease = sparkFlight.playingCount() === 0
    const { abilityId, completesAt } = ashCasting
    const release = {
        ...spark,
        abilityId,
        actorId: prayerId,
        actionId: 'ash-1',
    }
    audio.playEventSound(
        { kind: 'cast', phase: 'completed', actorId: prayerId, abilityId },
        completesAt
    )
    audio.playEventSound(release, completesAt)
    audio.playEventSound(release, completesAt)
    const flight = sparkFlight.instances.find((track) => track.isPlaying)
    return {
        noFlightBeforeRelease,
        whisperVolume: whisper?.volume,
        whisperOneShot: whisper?.loop === false,
        stoppedWhisperOnRelease: whisper?.isStopped,
        flightVolume: flight?.volume,
        flightRate: flight?.playbackRate,
        sharedSampleRate: sparkFlight.playbackRate,
        flightCount: sparkFlight.playingCount(),
    }
}

function exerciseMagicChannels(
    audio: GameAudio,
    magic: Sound,
    observe: ObserveCastWorld,
    step: (ms: number) => void
) {
    const chains: MagicChannelSnapshot = {
        abilityId: 'chains',
        startedAt: serverTime + 150,
        completesAt: serverTime + 2800,
    }
    observe(serverTime + 160, chains)
    const chainsTrack = magic.instances.find((track) => track.isPlaying)
    observe(serverTime + 180, chains)
    const chainsSingleTrack = magic.playingCount() === 1 && magic.instances.includes(chainsTrack!)
    audio.playEventSound(
        { kind: 'cast', phase: 'interrupted', actorId, abilityId: 'chains' },
        serverTime + 200
    )
    observe(serverTime + 210, chains)
    const chainsStopped = chainsTrack?.isStopped && magic.playingCount() === 0

    const portal: MagicChannelSnapshot = {
        abilityId: 'city_portal',
        startedAt: serverTime + 300,
        completesAt: serverTime + 3800,
    }
    observe(serverTime + 400, portal)
    const portalTrack = magic.instances.find((track) => track.isPlaying)
    step(1200)
    const portalHeldBeforeDeadline = portalTrack?.isPlaying
    step(2200)
    // TestClock advances its timestamp after the frame, so this update sees the deadline.
    step(16)
    return {
        chainsLoop: chainsTrack?.loop,
        chainsSingleTrack,
        chainsStopped,
        portalLoop: portalTrack?.loop,
        portalHeldBeforeDeadline,
        portalStoppedAtDeadline: portalTrack?.isStopped && magic.playingCount() === 0,
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

function shorelineSnapshot(at: number, magicChannel?: MagicChannelSnapshot, ashCasting?: AshCast) {
    const local = characterFixture(actorId, {
        position: { x: 64, y: 88 },
        ...(magicChannel && {
            abilities: { known: [], cooldowns: {}, barrier: null, casting: null, magicChannel },
        }),
    })
    const neighbor = characterFixture(prayerId, {
        position: { x: ashCasting ? 144 : 96, y: 88 },
        abilities: {
            known: ['pray'],
            cooldowns: {},
            barrier: null,
            casting: ashCasting
                ? null
                : {
                      abilityId: 'pray',
                      targetId: prayerId,
                      startedAt: serverTime - 50,
                      completesAt: serverTime + 10_000,
                  },
            ...(ashCasting && { ashCasting }),
        },
    })
    return {
        ...worldFixture([local, neighbor], at),
        location: { id: CENTER_LOCATION_ID, biome: 'city' } as WorldLocation,
    }
}
