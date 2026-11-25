import {
    CENTER_LOCATION_ID,
    getWorldLocationDefinition,
    GRID_SIZE,
    REGION_NAME,
    type WorldLocation,
    worldLocationId,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'
import { Future, Sound, type SoundTrack } from 'excalibur'

import { setAudioMuted } from '../../src/game/runtime/audioPreference'
import { GameAudio } from '../../src/game/runtime/gameAudio'
import { WorldAmbience } from '../../src/game/runtime/worldAmbience'
import {
    adventureFixture,
    characterFixture,
    worldFixture,
} from '../../src/game/testing/characterFixture'
import { checkDungeonDraft, checkWind } from './ambienceWindProbe'
import { mountEngine, startEngine, stepUntil, waitForEngine } from './engineSupport'

const listenerId = 'listener'
const locationId = worldLocationId(1, 1)
const tileSize = 16
const portalFile = 'portal-hum.wav'

export async function verifyAmbience(context: AudioContext) {
    const probe = createProbe(context)
    try {
        await probe.start()
        probe.observe({ wooded: true })
        await stepUntil(probe.portalDecoded.promise, probe.run.clock)
        setAudioMuted(true)
        probe.releasePortal.resolve()
        await waitForEngine(probe.run, () => probe.sounds.size === 4)
        const startedWhileMuted = probe.gains.size
        setAudioMuted(false)
        probe.advance()
        const startedWithoutFreshSnapshot = probe.gains.size

        const portal = await checkPortal(probe)
        const forest = await checkForest(probe)
        const wind = await checkWind(probe)
        const draft = await checkDungeonDraft(probe)
        return {
            startedWhileMuted,
            startedWithoutFreshSnapshot,
            portal,
            forest,
            wind,
            draft,
            decoded: [...probe.sounds.keys()].sort(),
        }
    } finally {
        probe.releasePortal.resolve()
        await probe.run.owner.cancel()
        setAudioMuted(false)
    }
}

export async function verifyForcedSilentAmbience(context: AudioContext) {
    const probe = createProbe(context)
    try {
        await probe.start()
        setAudioMuted(false)
        probe.observe({ wooded: true })
        probe.advance(40_000)
        probe.setUnderground(true)
        probe.observe({ portal: false, dungeonDraft: true })
        return { requests: probe.loadRequests, tracks: probe.gains.size }
    } finally {
        probe.releasePortal.resolve()
        await probe.run.owner.cancel()
    }
}

export async function verifyGestureAmbience(context: AudioContext, unlock: Element) {
    const probe = createProbe(context)
    try {
        await probe.start()
        await context.suspend()
        probe.releasePortal.resolve()
        probe.observe()
        probe.observe({ x: 176 })
        const before = { state: context.state, tracks: probe.gains.size }
        unlock.setAttribute('data-waiting-for-gesture', 'true')
        await waitForEngine(probe.run, () => probe.gains.size > 0)
        probe.advance()
        const [track] = probe.gains.keys()
        return {
            before,
            after: { state: context.state, tracks: probe.gains.size },
            volume: (track?.volume ?? 0) * (probe.sounds.get(portalFile)?.volume ?? 0),
        }
    } finally {
        unlock.removeAttribute('data-waiting-for-gesture')
        await probe.run.owner.cancel()
    }
}

function createProbe(context: AudioContext) {
    const run = mountEngine()
    const portalDecoded = new Future<void>()
    const releasePortal = new Future<void>()
    const sounds = new Map<string, Sound>()
    const gains = new Map<SoundTrack, AudioParam>()
    let now = 0
    let loadRequests = 0
    let cueRandom = 0
    const ambience = new WorldAmbience(run.engine, {
        now: () => now,
        random: () => cueRandom,
        audioContext: () => context,
        loadSound: async (src, signal) => {
            loadRequests++
            const response = await fetch(src, { signal })
            if (!response.ok) throw new Error(`Could not load ${src}`)
            const sound = await Sound.fromBlob(await response.blob())
            const fileName = src.slice(src.lastIndexOf('/') + 1)
            if (fileName === portalFile) {
                portalDecoded.resolve()
                await releasePortal.promise
            }
            sound.onPlay = ({ source, destination, track }) => {
                source.connect(destination)
                if (source instanceof GainNode) gains.set(track, source.gain)
            }
            sounds.set(fileName, sound)
            return sound
        },
    })
    const audio = new GameAudio(new Map(), undefined, ambience)
    run.owner.addCleanup(() => audio.stop())

    function advance(ms = 0): void {
        now += ms
        run.clock.step(16)
    }

    return {
        run,
        sounds,
        gains,
        portalDecoded,
        releasePortal,
        get loadRequests() {
            return loadRequests
        },
        async start() {
            await startEngine(run)
            this.setUnderground(false)
            audio.startWorldAmbience()
        },
        setUnderground(underground: boolean) {
            audio.setMap(
                {
                    footsteps: {
                        tileWidth: tileSize,
                        tileHeight: tileSize,
                        width: 80,
                        height: 80,
                        surfaces: [],
                    },
                    buildings: [],
                    ...(underground ? { dungeonLights: [] } : {}),
                },
                locationId
            )
        },
        advance,
        setCueRandom(value: number) {
            cueRandom = value
        },
        observe(options?: SnapshotOptions) {
            audio.observeWorld(snapshot(now, options), listenerId, () => true)
            advance()
        },
    }
}

export type AmbienceProbe = ReturnType<typeof createProbe>

async function checkPortal(probe: AmbienceProbe) {
    const sound = probe.sounds.get(portalFile)
    if (!sound?.data) throw new Error('Portal clip did not decode')
    probe.observe()
    const first = sound.instances[0]
    const gain = first && probe.gains.get(first)
    if (!first || !gain) throw new Error('Portal loop did not start')
    await waitForEngine(probe.run, () => gain.value > 0.9)
    const near = gain.value * sound.volume

    probe.observe({ x: 176 })
    await waitForEngine(probe.run, () => gain.value < 0.085)
    const far = gain.value * sound.volume
    probe.observe({ x: 176, secondPortal: true })
    const oneLoopForTwoPortals = sound.playingCount() === 1 && sound.instances[0] === first
    const closestVolume = first.volume
    probe.observe({ x: 384, secondPortal: true })
    probe.advance(200)
    probe.observe({ x: 176, secondPortal: true })
    probe.advance(201)
    const canceledFade = first.isPlaying && sound.instances[0] === first

    probe.observe({ x: 176, secondPortal: true, expiresIn: 100 })
    probe.advance(101)
    return {
        near,
        far,
        duration: sound.data.duration,
        oneLoopForTwoPortals,
        closestVolume,
        canceledFade,
        expiredWithoutSnapshot: first.isStopped,
    }
}

async function checkForest(probe: AmbienceProbe) {
    const startsBeforeForest = probe.gains.size
    const cues = () => Array.from(probe.gains.keys()).slice(startsBeforeForest)
    probe.observe({ wooded: true, portal: false })
    probe.advance(4_999)
    const beforeDelay = cues().length
    probe.advance(1)
    const first = cues()[0]
    if (!first) throw new Error('Forest cue did not start')
    probe.advance(40_000)
    const duringFirstCue = cues().length
    await stepUntil(first.done, probe.run.clock)
    probe.advance()
    probe.advance(15_999)
    const beforeCooldown = cues().length
    probe.advance(1)
    const afterCooldown = cues().length
    probe.observe({ portal: false })
    return {
        beforeDelay,
        duringFirstCue,
        beforeCooldown,
        afterCooldown,
        stoppedOnLeavingForest: cues().every((track) => track.isStopped),
    }
}

interface SnapshotOptions {
    x?: number
    wooded?: boolean
    portal?: boolean
    secondPortal?: boolean
    expiresIn?: number
    dungeonDraft?: boolean
}

function snapshot(
    now: number,
    {
        x = 80,
        wooded = false,
        portal = true,
        secondPortal = false,
        expiresIn = 60_000,
        dungeonDraft = false,
    }: SnapshotOptions = {}
): WorldSnapshot {
    const definition = getWorldLocationDefinition(locationId)
    if (!definition) throw new Error('Woodland fixture location is missing')
    const location: WorldLocation = {
        ...definition,
        columns: GRID_SIZE,
        rows: GRID_SIZE,
        regionName: REGION_NAME,
        map: {
            id: locationId,
            asset: { url: '', revision: '' },
            tileWidth: tileSize,
            tileHeight: tileSize,
            width: 80,
            height: 80,
            worldWidth: 80 * tileSize,
            worldHeight: 80 * tileSize,
            solidLayerNames: [],
        },
    }
    const position = { x, y: 80 }
    const world = worldFixture([characterFixture(listenerId, { position })], 100_000 + now)
    const adventure = adventureFixture()
    if (wooded) {
        adventure.resourceNodes = [80, 96, 112].map((treeX) => ({
            id: `tree-${treeX}`,
            locationId,
            kind: 'wood',
            source: 'tree',
            treeSize: 'adult',
            phase: 'ready',
            position: { x: treeX, y: 96 },
            remaining: 6,
        }))
    }
    return {
        ...world,
        location,
        adventure,
        dungeonDraft,
        portals: portal
            ? (secondPortal ? [32, 160] : [32]).map((portalX) => ({
                  id: `portal-${portalX}`,
                  locationId,
                  position: { x: portalX, y: position.y },
                  destinationLocationId: CENTER_LOCATION_ID,
                  destinationName: 'Novogorod',
                  expiresAt: world.serverTime + expiresIn,
              }))
            : [],
    }
}
