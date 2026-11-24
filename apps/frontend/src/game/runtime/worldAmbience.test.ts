import {
    type AdventureResourceNode,
    CENTER_LOCATION_ID,
    type PortalEndpointSnapshot,
    type WorldLocation,
    worldLocationId,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'
import type { Engine, PlayOptions, Sound, SoundTrack } from 'excalibur'
import { afterEach, expect, it, vi } from 'vitest'

import { adventureFixture, characterFixture, worldFixture } from '../testing/characterFixture'
import { WorldAmbience } from './worldAmbience'
import type { LoadAmbienceSound } from './worldAmbienceSounds'

const locationId = worldLocationId(1, 1)
const map = { tileWidth: 16, tileHeight: 16, buildings: [] }
const portalFile = 'portal-hum.wav'
const birdFile = 'forest-bird-1.mp3'
const windFile = 'forest-wind.mp3'
const waterFile = 'water-shore.wav'
const owners: WorldAmbience[] = []

function portal(id: string, x: number, options: Partial<PortalEndpointSnapshot> = {}) {
    return {
        id,
        position: { x, y: 0 },
        locationId,
        destinationLocationId: CENTER_LOCATION_ID,
        destinationName: 'City',
        expiresAt: 200_000,
        ...options,
    }
}

function tree(x: number, options: Partial<AdventureResourceNode> = {}): AdventureResourceNode {
    return {
        id: `tree-${x}`,
        position: { x, y: 0 },
        locationId,
        kind: 'wood',
        source: 'tree',
        phase: 'ready',
        treeSize: 'adult',
        remaining: 8,
        ...options,
    }
}

function snapshot(
    portals: PortalEndpointSnapshot[] = [],
    resourceNodes: AdventureResourceNode[] = []
) {
    return {
        ...worldFixture([characterFixture('listener')]),
        location: { id: locationId, biome: 'wilds' } as WorldLocation,
        adventure: { ...adventureFixture(), resourceNodes },
        portals,
    }
}

function fakeSound() {
    const voices: Array<{ volume: number; isStopped: boolean; stop: () => void }> = []
    const start = vi.fn<(options?: PlayOptions) => SoundTrack>((options) => {
        const voice = {
            volume: options?.volume ?? 1,
            isStopped: false,
            stop() {
                this.isStopped = true
            },
        }
        voices.push(voice)
        return voice as SoundTrack
    })
    const disconnect = vi.fn<() => void>()
    const sound = { start, output: { disconnect } } as unknown as Sound
    return { sound, voices, start, disconnect }
}

function setup() {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    let tick: () => void = () => undefined
    let now = 0
    const engine = {
        on: vi.fn<(event: string, listener: () => void) => void>((_event, listener) => {
            tick = listener
        }),
        off: vi.fn<() => void>(),
    }
    const context = { state: 'running' as AudioContextState, resume: vi.fn<() => Promise<void>>() }
    const sounds = new Map<string, ReturnType<typeof fakeSound>>()
    const loadSound = vi.fn<LoadAmbienceSound>((src) => {
        const clip = fakeSound()
        sounds.set(src.slice(src.lastIndexOf('/') + 1), clip)
        return Promise.resolve(clip.sound)
    })
    const random = vi.fn<() => number>(() => 0)
    const ambience = new WorldAmbience(engine as unknown as Engine, {
        now: () => now,
        random,
        audioContext: () => context,
        loadSound,
    })
    owners.push(ambience)
    ambience.setMap(locationId, map)
    ambience.start()
    return {
        ambience,
        engine,
        sounds,
        loadSound,
        random,
        context,
        observe(world: WorldSnapshot, visible: (position: { x: number }) => boolean = () => true) {
            ambience.observeWorld(world, 'listener', visible)
        },
        async step(ms = 0) {
            now += ms
            tick()
            await Promise.resolve()
            tick()
        },
    }
}

afterEach(() => {
    for (const ambience of owners.splice(0)) ambience.dispose()
    vi.restoreAllMocks()
    vi.useRealTimers()
})

it('uses the nearest visible portal, retains one loop as it moves, and retires it on expiry', async () => {
    const test = setup()
    test.observe(
        snapshot([
            portal('near', 48, { expiresAt: 100_100 }),
            portal('far', 120),
            portal('behind-roof', 32),
            portal('other-location', 8, { locationId: CENTER_LOCATION_ID }),
            portal('expired', 0, { expiresAt: 100_000 }),
        ]),
        ({ x }) => x !== 32
    )
    await test.step()
    const clip = test.sounds.get(portalFile)!
    const [near] = clip.voices
    expect(clip.start).toHaveBeenCalledExactlyOnceWith({ loop: true, volume: 0 })
    expect(near?.volume).toBe(1)

    await test.step(100)
    expect(near?.isStopped).toBe(true)
    expect(clip.voices[1]?.volume).toBe(0.25)
    test.observe(snapshot([portal('far', 192)]))
    await test.step()
    expect(clip.voices[1]?.volume).toBe(0)
    await test.step(399)
    expect(clip.voices[1]?.isStopped).toBe(false)
    await test.step(1)
    expect(clip.voices[1]?.isStopped).toBe(true)

    test.observe(snapshot([portal('new', 192)]))
    await test.step()
    expect(clip.start).toHaveBeenCalledTimes(2)
})

it('keeps the forest delay at the treeline and stops a cue on entering a building', async () => {
    const test = setup()
    test.ambience.setMap(locationId, {
        ...map,
        buildings: [
            {
                id: 'hut',
                name: 'Hut',
                x: 1,
                y: 0,
                width: 16,
                height: 16,
                entry: { x: 1, y: 0 },
                cover: document.createElement('canvas'),
            },
        ],
    })
    const readyTrees = [tree(0), tree(80), tree(160)]
    const otherTrees = [
        tree(170),
        tree(176),
        tree(16, { phase: 'stump' }),
        tree(32, { treeSize: 'small' }),
    ]
    test.observe(snapshot([], otherTrees))
    await test.step()
    expect(test.loadSound).not.toHaveBeenCalled()
    test.observe(snapshot([], readyTrees))
    await test.step()
    const clip = test.sounds.get(birdFile)!
    test.observe(snapshot([], otherTrees))
    await test.step(4999)
    expect(clip.start).not.toHaveBeenCalled()
    await test.step(1)
    expect(clip.start).toHaveBeenCalledOnce()

    const indoors = snapshot([], readyTrees)
    indoors.characters[0]!.position.x = 1
    test.observe(indoors)
    expect(clip.voices[0]?.isStopped).toBe(true)
    await test.step(40_000)
    expect(clip.start).toHaveBeenCalledOnce()
})

it('plays one shore loop, attenuates from the water edge, and stops indoors', async () => {
    const test = setup()
    test.ambience.setMap(locationId, {
        ...map,
        buildings: [
            {
                id: 'hut',
                name: 'Hut',
                x: 64,
                y: 0,
                width: 16,
                height: 16,
                entry: { x: 64, y: 0 },
                cover: document.createElement('canvas'),
            },
        ],
        ambientTerrain: {
            width: 10,
            height: 1,
            water: Uint8Array.from([0, 0, 1, 0, 0, 0, 0, 0, 0, 0]),
            fortifications: [],
        },
    })
    function move(x: number): void {
        const world = snapshot()
        world.characters[0]!.position.x = x
        test.observe(world)
    }

    move(16)
    await test.step()
    const clip = test.sounds.get(waterFile)!
    expect(clip.start).toHaveBeenCalledExactlyOnceWith({ loop: true, volume: 0 })
    expect(clip.voices[0]?.volume).toBe(1)
    move(80)
    await test.step()
    expect(clip.voices[0]?.volume).toBe((3 / 4) ** 2)
    move(128)
    await test.step()
    expect(clip.voices[0]?.volume).toBe(0)
    await test.step(399)
    expect(clip.voices[0]?.isStopped).toBe(false)
    await test.step(1)
    expect(clip.voices[0]?.isStopped).toBe(true)

    move(16)
    await test.step()
    expect(clip.start).toHaveBeenCalledTimes(2)
    move(64)
    expect(clip.voices[1]?.isStopped).toBe(true)
    await test.step(500)
    expect(clip.start).toHaveBeenCalledTimes(2)
})

it('schedules half-gain wall gusts and hands their slot to forest cues on exit', async () => {
    const test = setup()
    test.ambience.setMap(locationId, {
        ...map,
        ambientTerrain: {
            width: 16,
            height: 16,
            water: new Uint8Array(),
            fortifications: [{ x: 16, y: 80, width: 192, height: 16 }],
        },
    })
    const nearWall = snapshot()
    nearWall.characters[0]!.position = { x: 96, y: 64 }
    test.observe(nearWall)
    await test.step()
    const wind = test.sounds.get(windFile)!
    await test.step(7999)
    expect(wind.start).not.toHaveBeenCalled()
    await test.step(1)
    expect(wind.start).toHaveBeenCalledExactlyOnceWith({ volume: 0.5 })
    wind.voices[0]?.stop()
    await test.step()
    await test.step(24999)
    expect(wind.start).toHaveBeenCalledOnce()
    await test.step(1)
    expect(wind.start).toHaveBeenCalledTimes(2)

    test.observe(snapshot([], [tree(0), tree(80), tree(160)]))
    expect(wind.voices[1]?.isStopped).toBe(true)
    await test.step()
    const bird = test.sounds.get(birdFile)!
    await test.step(5000)
    expect(bird.start).toHaveBeenCalledOnce()
    expect(wind.voices.every((track) => track.isStopped)).toBe(true)
})

it('isolates a rejected clip and never starts a clip that decodes after its owner is gone', async () => {
    const test = setup()
    const delayed = fakeSound()
    let finishPortal: (sound: Sound) => void = () => undefined
    test.loadSound.mockImplementationOnce(
        () =>
            new Promise((resolve) => {
                finishPortal = resolve
            })
    )
    test.loadSound.mockRejectedValueOnce(new Error('bird decode failed'))
    test.random.mockReturnValue(0.8)
    test.observe(snapshot([portal('near', 48)], [tree(0), tree(80), tree(160)]))
    await test.step()
    await test.step(9000)
    expect(test.sounds.get(windFile)?.start).toHaveBeenCalledOnce()
    expect(test.loadSound).toHaveBeenCalledTimes(4)
    test.ambience.dispose()
    expect(test.engine.off).toHaveBeenCalledOnce()
    expect(test.loadSound.mock.calls[0]?.[1].aborted).toBe(true)
    expect(test.sounds.get(windFile)?.disconnect).toHaveBeenCalledOnce()
    finishPortal(delayed.sound)
    await test.step()
    expect(delayed.start).not.toHaveBeenCalled()
})

it('waits for a running audio context and discards observations across suspension', async () => {
    const test = setup()
    const world = snapshot([portal('near', 48)])
    test.context.state = 'suspended'
    test.observe(world)
    await test.step()
    expect(test.loadSound).not.toHaveBeenCalled()
    test.context.state = 'running'
    await test.step()
    const clip = test.sounds.get(portalFile)!
    expect(clip.start).toHaveBeenCalledOnce()
    test.ambience.clear()
    await test.step()
    expect(clip.voices[0]?.isStopped).toBe(true)
    expect(clip.start).toHaveBeenCalledOnce()
    test.observe(world)
    await test.step()
    expect(clip.start).toHaveBeenCalledTimes(2)
    expect(test.loadSound).toHaveBeenCalledOnce()
})

it('aborts a timed-out clip and leaves it unavailable until the next engine run', async () => {
    vi.useFakeTimers()
    const test = setup()
    const delayed = fakeSound()
    let finish: (sound: Sound) => void = () => undefined
    test.loadSound.mockImplementationOnce(
        () =>
            new Promise((resolve) => {
                finish = resolve
            })
    )
    test.observe(snapshot([portal('near', 48)]))
    await test.step()
    vi.advanceTimersByTime(8000)
    expect(test.loadSound.mock.calls[0]?.[1].aborted).toBe(true)
    finish(delayed.sound)
    await test.step(8000)
    expect(delayed.start).not.toHaveBeenCalled()
    expect(test.loadSound).toHaveBeenCalledOnce()
})
