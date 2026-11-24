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
    expect(test.sounds.play).toHaveBeenCalledExactlyOnceWith('prayerWhisper', { volume: 1 })

    test.observe(epoch + 600, [caster('me', 0), caster('priest', 80, rite)])
    expect(test.tracks[0]?.volume).toBe(0.25)
    test.advance(599)
    expect(test.tracks[0]?.isStopped).toBe(false)
    test.advance(1)
    expect(test.tracks[0]?.isStopped).toBe(true)
    expect(test.sounds.play).toHaveBeenCalledTimes(1)
})

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
    expect(test.sounds.play).toHaveBeenCalledExactlyOnceWith('magicCast', { volume: 1 })
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
        ['magicCast', { volume: 1 }],
        ['magicCast', { volume: 0.25 }],
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

it('stops audio on lost visibility, death and clear and keeps consumed cast receipts', () => {
    const test = setup()
    const me = caster('me', 0)
    const mage = caster('mage', 16, channel('city_portal', epoch, epoch + 2200))
    const priest = caster('priest', 32, prayer(epoch, epoch + 2200))
    test.observe(epoch + 10, [me, mage, priest])
    test.observe(epoch + 11, [me, mage, priest], (id) => id !== 'mage')
    expect(test.tracks[0]?.isStopped).toBe(true)
    test.audio.receive({ kind: 'death', targetId: 'priest' }, epoch + 12)
    expect(test.tracks[1]?.isStopped).toBe(true)

    test.audio.clear()
    test.observe(epoch + 13, [me, mage])
    expect(test.tracks).toHaveLength(2)
    test.audio.reset()
    test.observe(epoch + 13, [me, mage])
    expect(test.tracks).toHaveLength(3)
})

it.each(['spark', 'fireball', 'greater_fireball'] as const)(
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

it('prefetches both optional cue assets', () => {
    const test = setup()
    test.audio.prepare()
    expect(test.sounds.request.mock.calls).toEqual([['magicCast'], ['prayerWhisper']])
})
