import type {
    CharacterAbilitiesSnapshot,
    CharacterSnapshot,
    GameEventPayload,
    WorldLocation,
} from '@my-game-ratata/contracts'
import type { PlayOptions, SoundTrack } from 'excalibur'
import { expect, it, vi } from 'vitest'

import { characterFixture, worldFixture } from '../testing/characterFixture'
import { CastAudio, isMagicCastAttack } from './castAudio'
import type { AmbienceSoundId } from './worldAmbienceSounds'

const map = { tileWidth: 16, tileHeight: 16 }
const location = { id: 'map-2-2' } as WorldLocation
const epoch = 1730000000000

function caster(
    id: string,
    x: number,
    action?: Partial<CharacterAbilitiesSnapshot>
): CharacterSnapshot {
    return characterFixture(id, {
        position: { x, y: 0 },
        abilities: { known: [], cooldowns: {}, barrier: null, casting: null, ...action },
    })
}

function channel(abilityId: 'chains' | 'city_portal', startedAt: number, completesAt: number) {
    return { magicChannel: { abilityId, startedAt, completesAt } }
}

function prayer(startedAt: number, completesAt: number): Partial<CharacterAbilitiesSnapshot> {
    return {
        casting: {
            abilityId: 'pray_road',
            mode: 'revive',
            startedAt,
            completesAt,
            targetId: 'ally',
        },
    }
}

function setup() {
    let now = 10_000
    let ready = true
    let running = true
    const tracks: Array<{ isStopped: boolean; volume: number; stop: () => void }> = []
    const sounds = {
        request: vi.fn<(id: AmbienceSoundId) => void>(),
        play: vi.fn<(id: AmbienceSoundId, options?: PlayOptions) => SoundTrack | undefined>(
            (_id, options) => {
                if (!ready) return undefined
                const track = {
                    volume: options?.volume ?? 1,
                    isStopped: false,
                    stop() {
                        this.isStopped = true
                    },
                }
                tracks.push(track)
                return track as SoundTrack
            }
        ),
    }
    const audio = new CastAudio(sounds, { now: () => now, audioRunning: () => running })
    return {
        audio,
        sounds,
        tracks,
        observe(
            serverTime: number,
            actors: CharacterSnapshot[],
            isVisible: (id: string) => boolean = () => true
        ) {
            audio.observeWorld(
                { ...worldFixture(actors, serverTime), location },
                'me',
                map,
                isVisible
            )
        },
        advance(ms: number) {
            now += ms
            audio.update()
        },
        setReady(value: boolean) {
            ready = value
        },
        setRunning(value: boolean) {
            running = value
        },
    }
}

it('plays a visible mid-cast priest once and updates the voice gain until the world-clock deadline', () => {
    const test = setup()
    const rite = prayer(epoch, epoch + 1200)
    test.observe(epoch + 500, [caster('me', 0), caster('priest', 32, rite)])
    expect(test.sounds.play).toHaveBeenCalledExactlyOnceWith('prayerWhisper', {
        volume: 1,
        loop: false,
    })

    test.observe(epoch + 600, [caster('me', 0), caster('priest', 80, rite)])
    expect(test.tracks[0]?.volume).toBe(0.25)
    test.advance(599)
    expect(test.tracks[0]?.isStopped).toBe(false)
    test.advance(1)
    expect(test.tracks[0]?.isStopped).toBe(true)
    expect(test.sounds.play).toHaveBeenCalledTimes(1)
})

it.each(['chains', 'city_portal'] as const)(
    'keeps %s looping once per actor until its deadline, even without a new snapshot',
    (abilityId) => {
        const test = setup()
        const actors = [
            caster('me', 0),
            caster('mage', 16, channel(abilityId, epoch, epoch + 3000)),
        ]
        test.observe(epoch + 100, actors)
        expect(test.sounds.play).toHaveBeenCalledExactlyOnceWith('magicCast', {
            volume: 1,
            loop: true,
        })

        test.advance(1200)
        test.observe(epoch + 1320, actors)
        test.advance(1679)
        expect(test.tracks[0]?.isStopped).toBe(false)
        expect(test.sounds.play).toHaveBeenCalledTimes(1)

        test.advance(1)
        expect(test.tracks[0]?.isStopped).toBe(true)
        test.observe(epoch + 1321, actors)
        expect(test.sounds.play).toHaveBeenCalledTimes(1)
    }
)

it('blocks a stale channel after its interrupt and permits a later cast by the same actor', () => {
    const test = setup()
    const oldCast = channel('chains', epoch, epoch + 4000)
    const me = caster('me', 0)
    test.observe(epoch + 1000, [me, caster('mage', 16, oldCast)])
    const interrupted = {
        kind: 'cast',
        abilityId: 'chains',
        actorId: 'mage',
        phase: 'interrupted',
    } as const
    test.audio.receive(interrupted, epoch + 1500)
    expect(test.tracks[0]?.isStopped).toBe(true)

    test.observe(epoch + 1200, [me, caster('mage', 16, oldCast)])
    expect(test.sounds.play).toHaveBeenCalledTimes(1)
    const newCast = channel('chains', epoch + 1800, epoch + 4800)
    test.observe(epoch + 1900, [me, caster('mage', 16, newCast)])
    expect(test.sounds.play).toHaveBeenCalledTimes(2)
    test.audio.receive(interrupted, epoch + 1500)
    expect(test.tracks[1]?.isStopped).toBe(false)
})

it('discards delayed loads for interrupted or nearly complete channels', () => {
    const test = setup()
    const me = caster('me', 0)
    const mage = caster('mage', 16, channel('chains', epoch, epoch + 2200))
    test.setReady(false)
    test.observe(epoch + 100, [me, mage])
    expect(test.tracks).toHaveLength(0)
    test.audio.receive(
        { kind: 'cast', actorId: 'mage', abilityId: 'chains', phase: 'interrupted' },
        epoch + 200
    )
    test.setReady(true)
    test.observe(epoch + 195, [me, mage])
    expect(test.tracks).toHaveLength(0)
    const second = caster('mage', 16, channel('city_portal', epoch + 300, epoch + 1100))
    test.observe(epoch + 901, [me, second])
    expect(test.tracks).toHaveLength(0)
})

it('retains same-map terminal events while the audio observation is cleared', () => {
    const test = setup()
    const me = caster('me', 0)
    const mage = caster('mage', 16, channel('chains', epoch, epoch + 2000))
    test.setReady(false)
    test.observe(epoch + 100, [me, mage])
    test.audio.clear()
    test.audio.receive(
        { kind: 'cast', actorId: 'mage', abilityId: 'chains', phase: 'interrupted' },
        epoch + 200
    )
    test.setReady(true)
    test.observe(epoch + 150, [me, mage])
    expect(test.tracks).toHaveLength(0)
})

it('does not infer a future cast from a malformed early snapshot, then honors the inclusive threshold', () => {
    const test = setup()
    const mage = caster('me', 0, channel('city_portal', epoch + 1000, epoch + 1400))
    test.observe(epoch + 999, [mage])
    test.advance(10)
    expect(test.sounds.play).not.toHaveBeenCalled()

    test.observe(epoch + 1200, [mage])
    expect(test.sounds.play).toHaveBeenCalledExactlyOnceWith('magicCast', {
        volume: 1,
        loop: true,
    })
})

it('reserves a local voice, keeps playing voices and admits the nearest remote channels', () => {
    const test = setup()
    const me = caster('me', 0)
    const readyCast = channel('chains', epoch, epoch + 2600)
    const far = caster('far', 112, readyCast)
    const middle = caster('middle', 80, readyCast)
    const near = caster('near', 16, readyCast)
    test.observe(epoch + 100, [far, middle, near, me])
    expect(test.sounds.play.mock.calls).toEqual([
        ['magicCast', { volume: 1, loop: true }],
        ['magicCast', { volume: 0.25, loop: true }],
    ])

    test.audio.receive(
        { kind: 'cast', phase: 'completed', abilityId: 'blink', actorId: 'far' },
        epoch + 110
    )
    test.audio.receive(
        { kind: 'cast', phase: 'completed', abilityId: 'blink', actorId: 'me' },
        epoch + 111
    )
    test.audio.receive(
        { kind: 'cast', phase: 'completed', abilityId: 'dispel_magic', actorId: 'me' },
        epoch + 112
    )
    expect(test.tracks).toHaveLength(3)
    expect(test.tracks.every((track) => !track.isStopped)).toBe(true)
})

it('restarts only the active magic loop when visibility returns and after a clear', () => {
    const test = setup()
    const me = caster('me', 0)
    const mage = caster('mage', 16, channel('city_portal', epoch, epoch + 2200))
    const priest = caster('priest', 32, prayer(epoch, epoch + 2200))
    const actors = [me, mage, priest]
    test.observe(epoch + 10, actors)
    test.observe(epoch + 11, actors, (id) => id !== 'mage')
    expect(test.tracks[0]?.isStopped).toBe(true)
    test.observe(epoch + 12, actors)
    expect(test.tracks[2]?.isStopped).toBe(false)

    test.audio.clear()
    expect(test.tracks.every((track) => track.isStopped)).toBe(true)
    test.observe(epoch + 13, actors)
    expect(test.sounds.play.mock.calls.map(([sound]) => sound)).toEqual([
        'magicCast',
        'prayerWhisper',
        'magicCast',
        'magicCast',
    ])
    test.audio.receive({ kind: 'death', targetId: 'mage' }, epoch + 14)
    expect(test.tracks[3]?.isStopped).toBe(true)
    test.observe(epoch + 14, actors)
    expect(test.tracks).toHaveLength(4)
})

it('restarts a still-active magic loop after the audio device resumes', () => {
    const test = setup()
    test.observe(epoch + 100, [caster('me', 0, channel('chains', epoch, epoch + 2200))])
    test.setRunning(false)
    test.advance(100)
    expect(test.tracks[0]?.isStopped).toBe(true)

    test.setRunning(true)
    test.advance(100)
    test.advance(100)
    expect(test.tracks[1]?.isStopped).toBe(false)
    expect(test.tracks).toHaveLength(2)
})

it.each(['fireball', 'greater_fireball'] as const)(
    'plays %s only at the accepted start and deduplicates it by action ID',
    (abilityId) => {
        const test = setup()
        test.observe(epoch, [caster('me', 0), caster('mage', 80)])
        const attack = {
            kind: 'attack',
            delivery: 'magic',
            abilityId,
            actionId: 'attack:1',
            actorId: 'mage',
        } as const
        expect(isMagicCastAttack(attack)).toBe(true)
        test.audio.receive({ ...attack, phase: 'completed' }, epoch + 1)
        expect(test.sounds.play).not.toHaveBeenCalled()
        test.audio.receive(attack, epoch + 2)
        expect(test.sounds.play).toHaveBeenCalledExactlyOnceWith('magicCast', { volume: 0.25 })
        test.tracks[0]?.stop()
        test.audio.receive({ ...attack, phase: 'started' }, epoch + 3)
        expect(test.sounds.play).toHaveBeenCalledTimes(1)
    }
)

it('whispers during Spark windup and plays one buzz on release', () => {
    const test = setup()
    test.observe(epoch, [caster('me', 0), caster('mage', 80)])
    const spark = {
        kind: 'attack',
        abilityId: 'spark',
        delivery: 'magic',
        actionId: 'spark:1',
        actorId: 'mage',
    } as const
    const projectile = { origin: { x: 80, y: 0 }, endpoint: { x: 0, y: 0 } }
    expect(isMagicCastAttack(spark)).toBe(true)
    const started = { ...spark, phase: 'started' } as const
    const released = { ...spark, phase: 'completed', projectile } as const
    test.audio.receive(started, epoch + 1)
    test.audio.receive(started, epoch + 2)
    expect(test.sounds.play).toHaveBeenCalledExactlyOnceWith('magicCast', { volume: 0.25 })

    test.audio.receive(released, epoch + 3)
    expect(test.tracks[0]?.isStopped).toBe(true)
    expect(test.sounds.play).toHaveBeenNthCalledWith(2, 'sparkFlight', { volume: 0.25 })

    test.tracks[1]?.stop()
    test.audio.receive(released, epoch + 4)
    test.audio.receive(started, epoch + 5)
    expect(test.sounds.play).toHaveBeenCalledTimes(2)
    test.audio.receive({ ...spark, actionId: 'spark:2' }, epoch + 6)
    expect(test.sounds.play).toHaveBeenNthCalledWith(3, 'sparkFlight', { volume: 0.25 })
})

it('silences interrupted Spark and protects a later cast from stale terminal events', () => {
    const test = setup()
    test.observe(epoch, [caster('me', 0)])
    const spark = {
        kind: 'attack',
        actorId: 'me',
        abilityId: 'spark',
        delivery: 'magic',
    } as const
    const first = { ...spark, actionId: 'spark:1', phase: 'started' } as const
    const interrupted = { ...first, phase: 'interrupted' } as const
    test.audio.receive(first, epoch + 1)
    test.audio.receive(interrupted, epoch + 2)
    expect(test.tracks[0]?.isStopped).toBe(true)

    const second = { ...first, actionId: 'spark:2' }
    test.audio.receive(second, epoch + 3)
    test.audio.receive(interrupted, epoch + 4)
    expect(test.tracks[1]?.isStopped).toBe(false)

    test.audio.receive({ ...second, phase: 'completed' }, epoch + 5)
    expect(test.tracks[1]?.isStopped).toBe(true)
    expect(test.sounds.play).toHaveBeenCalledTimes(2)
})

it('silences a caster who dies during the Spark whisper', () => {
    const test = setup()
    test.observe(epoch, [caster('me', 0), caster('mage', 32)])
    test.audio.receive(
        {
            kind: 'attack',
            actorId: 'mage',
            actionId: 'spark:1',
            abilityId: 'spark',
            delivery: 'magic',
            phase: 'started',
        },
        epoch + 1
    )

    test.audio.receive({ kind: 'death', actorId: 'skeleton', targetId: 'mage' }, epoch + 2)

    expect(test.tracks[0]?.isStopped).toBe(true)
    expect(test.sounds.play).toHaveBeenCalledTimes(1)
})

it.each(['ash_exhaustion', 'ash_tame'] as const)(
    'plays an attenuated %s prayer whisper through terminal cast events',
    (abilityId) => {
        const test = setup()
        const actors = [
            caster('me', 0),
            caster('savva', 80, {
                ashCasting: {
                    abilityId,
                    targetId: 'target',
                    startedAt: epoch,
                    completesAt: epoch + 2000,
                },
            }),
        ]
        test.observe(epoch + 100, actors)
        expect(test.sounds.play).toHaveBeenCalledExactlyOnceWith('prayerWhisper', {
            volume: 0.25,
            loop: false,
        })
        test.audio.receive(
            { kind: 'cast', abilityId, actorId: 'savva', phase: 'interrupted' },
            epoch + 200
        )
        expect(test.tracks[0]?.isStopped).toBe(true)
        test.observe(epoch + 201, actors)
        expect(test.sounds.play).toHaveBeenCalledTimes(1)
    }
)

it('plays the curse release once with an isolated, lower playback rate', () => {
    const test = setup()
    const attack = {
        kind: 'attack',
        abilityId: 'ash_exhaustion',
        delivery: 'magic',
        actionId: 'ash:1',
        actorId: 'savva',
    } as const
    test.observe(epoch + 100, [caster('me', 0), caster('savva', 80)])
    expect(isMagicCastAttack(attack)).toBe(true)
    test.audio.receive({ ...attack, phase: 'started' }, epoch + 100)
    test.audio.receive({ ...attack, phase: 'interrupted' }, epoch + 200)
    expect(test.sounds.play).not.toHaveBeenCalled()
    test.audio.receive(attack, epoch + 300)
    expect(test.sounds.play).toHaveBeenCalledExactlyOnceWith('sparkFlight', {
        volume: 0.25,
        playbackRate: 0.72,
    })
    test.tracks[0]?.stop()
    test.audio.receive(attack, epoch + 300)
    test.audio.receive({ ...attack, abilityId: 'spark' }, epoch + 400)
    expect(test.sounds.play).toHaveBeenCalledTimes(2)
    expect(test.sounds.play).toHaveBeenLastCalledWith('sparkFlight', { volume: 0.25 })
})

it('plays instant devotion but leaves ordinary completed prayers, barriers removed by dispel and misses silent', () => {
    const test = setup()
    test.observe(epoch, [caster('me', 0)])
    const finished = { kind: 'cast', phase: 'completed', abilityId: 'pray', actorId: 'me' } as const
    const removedBarrier = {
        kind: 'status',
        statusId: 'barrier',
        abilityId: 'dispel_magic',
        actorId: 'me',
    } as const
    test.audio.receive(finished, epoch + 1)
    test.audio.receive(removedBarrier, epoch + 2)
    test.audio.receive({ kind: 'miss', actorId: 'me', abilityId: 'spark' }, epoch + 3)
    expect(test.sounds.play).not.toHaveBeenCalled()

    const devotion = { ...finished, castMode: 'devotion' } as const
    test.audio.receive(devotion, epoch + 4)
    test.tracks[0]?.stop()
    test.audio.receive(devotion, epoch + 4)
    expect(test.sounds.play).toHaveBeenCalledExactlyOnceWith('prayerWhisper', { volume: 1 })

    test.audio.receive({ ...removedBarrier, abilityId: 'barrier' }, epoch + 5)
    expect(test.sounds.play).toHaveBeenLastCalledWith('magicCast', { volume: 1 })
})

it('ignores cross-map, invisible and out-of-range sources, and never replays an unavailable instant', () => {
    const test = setup()
    const me = caster('me', 0)
    const hidden = caster('hidden', 16)
    const distant = caster('far', 128)
    const blink = { kind: 'cast', phase: 'completed', abilityId: 'blink' } as const
    test.observe(epoch, [me, hidden, distant], (id) => id !== 'hidden')
    const unavailableEvents: GameEventPayload[] = [
        blink,
        { ...blink, actorId: 'hidden' },
        { ...blink, actorId: 'far' },
        { ...blink, actorId: 'me', locationId: 'map-0-0' },
    ]
    for (const event of unavailableEvents) test.audio.receive(event, epoch + 1)
    expect(test.sounds.play).not.toHaveBeenCalled()
    test.setRunning(false)
    test.audio.receive({ ...blink, actorId: 'me' }, epoch + 2)
    test.setRunning(true)
    test.audio.receive({ ...blink, actorId: 'me' }, epoch + 2)
    expect(test.sounds.play).not.toHaveBeenCalled()
    test.setReady(false)
    const deduped = { ...blink, actorId: 'me', eventId: 'test-event' }
    test.audio.receive(deduped, epoch + 3)
    test.setReady(true)
    test.audio.receive(deduped, epoch + 4)
    expect(test.tracks).toHaveLength(0)
})

it('prefetches cast and projectile cues', () => {
    const test = setup()
    test.audio.prepare()
    expect(test.sounds.request.mock.calls).toEqual([
        ['magicCast'],
        ['prayerWhisper'],
        ['sparkFlight'],
    ])
})
