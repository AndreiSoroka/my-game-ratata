import type { CharacterSnapshot, GameEventPayload, WorldLocation } from '@my-game-ratata/contracts'
import type { PlayOptions, SoundTrack } from 'excalibur'
import { expect, it, vi } from 'vitest'

import { characterFixture, worldFixture } from '../testing/characterFixture'
import { HumanDeathAudio } from './humanDeathAudio'
import type { AmbienceSoundId } from './worldAmbienceSounds'

const tileSize = { tileWidth: 16, tileHeight: 16 }
const location = { id: 'map-2-2' } as WorldLocation
const epoch = 1730000000000

function actor(id: string, x = 0, overrides: Partial<CharacterSnapshot> = {}): CharacterSnapshot {
    return characterFixture(id, { position: { x, y: 0 }, ...overrides })
}

function setup() {
    let loaded = true
    let running = true
    const tracks: Array<{ isStopped: boolean; stop: () => void }> = []
    const sounds = {
        request: vi.fn<(id: AmbienceSoundId) => void>(),
        play: vi.fn<(id: AmbienceSoundId, options?: PlayOptions) => SoundTrack | undefined>(() => {
            if (!loaded) return undefined
            const track = {
                isStopped: false,
                stop() {
                    this.isStopped = true
                },
            }
            tracks.push(track)
            return track as SoundTrack
        }),
    }
    const audio = new HumanDeathAudio(sounds, () => running)
    return {
        audio,
        sounds,
        tracks,
        observe(
            actors: CharacterSnapshot[],
            serverTime = epoch,
            visible: (id: string) => boolean = () => true
        ) {
            audio.observeWorld(
                { ...worldFixture(actors, serverTime), location },
                'me',
                tileSize,
                visible
            )
        },
        death(targetId: string, serverTime = epoch + 1, overrides: Partial<GameEventPayload> = {}) {
            audio.receive({ kind: 'death', targetId, ...overrides }, serverTime)
        },
        setLoaded(value: boolean) {
            loaded = value
        },
        setRunning(value: boolean) {
            running = value
        },
    }
}

it('prepares one clip and plays authoritative deaths with victim distance gain', () => {
    const test = setup()
    test.audio.prepare()
    expect(test.sounds.request).toHaveBeenCalledExactlyOnceWith('humanDeath')
    test.observe([actor('me'), actor('near', 32), actor('far', 80)])
    test.death('near')
    test.death('far')
    expect(test.sounds.play.mock.calls).toEqual([
        ['humanDeath', { volume: 1 }],
        ['humanDeath', { volume: 0.25 }],
    ])
})

it('reuses the human cue for a Fat Zombie once per resolved death', () => {
    const test = setup()
    const zombie = actor('zombie', 80, { archetype: 'fat_zombie', creatureType: 'undead' })
    test.observe([actor('me'), zombie])
    test.death(zombie.id, epoch + 1, { eventId: 'zombie-death-1' })
    test.tracks[0]?.stop()
    test.death(zombie.id, epoch + 2, { eventId: 'zombie-death-1' })
    expect(test.sounds.play).toHaveBeenCalledExactlyOnceWith('humanDeath', { volume: 0.25 })

    test.observe([actor('me'), { ...zombie, alive: false }], epoch + 3)
    test.death(zombie.id, epoch + 4, { eventId: 'already-dead' })
    expect(test.sounds.play).toHaveBeenCalledTimes(1)

    test.observe([actor('me'), zombie], epoch + 60_001)
    test.death(zombie.id, epoch + 60_002, { eventId: 'zombie-death-2' })
    expect(test.sounds.play).toHaveBeenCalledTimes(2)
})

it('ignores hidden, absent, distant, dead and unsupported victims', () => {
    const test = setup()
    const victims = [
        actor('lich', 16, { creatureType: 'undead' }),
        actor('skeleton', 16, { archetype: 'skeleton', creatureType: 'undead' }),
        actor('slime', 16, { archetype: 'slime', creatureType: 'ooze' }),
        actor('dummy', 16, { creatureType: 'construct' }),
        actor('corpse', 16, { alive: false }),
        actor('hidden', 16, { archetype: 'fat_zombie', creatureType: 'undead' }),
        actor('distant', 128),
    ]
    test.observe([actor('me'), ...victims], epoch, (id) => id !== 'hidden')
    for (const victim of victims) test.death(victim.id)
    test.death('absent')
    expect(test.sounds.play).not.toHaveBeenCalled()
})

it('accepts events from the observed map and deduplicates by event or server time', () => {
    const test = setup()
    test.death('me')
    test.observe([actor('me'), actor('victim', 16)])
    test.death('victim', epoch - 1)
    test.death('victim', epoch + 1, { locationId: 'map-1-1' })
    test.death('victim', epoch + 2, { kind: 'permadeath' })
    expect(test.sounds.play).not.toHaveBeenCalled()
    test.death('victim')
    test.tracks[0]?.stop()
    test.death('victim')
    test.death('victim', epoch + 2, { eventId: 'death-2' })
    test.tracks[1]?.stop()
    test.death('victim', epoch + 3, { eventId: 'death-2' })
    expect(test.sounds.play).toHaveBeenCalledTimes(2)
})

it('reserves one track per victim and two in total, without queuing rejected cues', () => {
    const test = setup()
    test.observe([actor('me'), actor('first', 16), actor('second', 16), actor('third', 16)])
    test.death('first')
    test.death('first', epoch + 2)
    test.death('second')
    test.death('third')
    expect(test.tracks).toHaveLength(2)
    test.tracks[0]?.stop()
    test.death('third')
    expect(test.tracks).toHaveLength(2)
    test.death('third', epoch + 2)
    expect(test.tracks).toHaveLength(3)
})

it('lets the local death finish after clearing observations and stops it on lifecycle clear', () => {
    const test = setup()
    test.observe([actor('me'), actor('other', 16)])
    test.death('me')
    test.audio.clearObservation()
    test.death('other')
    test.observe([actor('me', 0, { alive: false }), actor('other', 16)], epoch + 2)
    test.death('other', epoch + 3)
    expect(test.tracks).toHaveLength(1)
    expect(test.tracks[0]?.isStopped).toBe(false)
    test.audio.clear()
    expect(test.tracks[0]?.isStopped).toBe(true)

    test.observe([actor('me')])
    test.death('me')
    expect(test.tracks).toHaveLength(1)
    test.audio.reset()
    test.observe([actor('me')])
    test.death('me')
    expect(test.tracks).toHaveLength(2)
})

it('drops an unavailable clip or audio context without replaying the event later', () => {
    const test = setup()
    test.observe([actor('me'), actor('other', 16)])
    test.setRunning(false)
    test.death('other')
    expect(test.sounds.play).not.toHaveBeenCalled()
    test.setRunning(true)
    test.death('other')
    expect(test.sounds.play).not.toHaveBeenCalled()
    test.setLoaded(false)
    test.death('other', epoch + 2)
    test.setLoaded(true)
    test.death('other', epoch + 2)
    expect(test.sounds.play).toHaveBeenCalledTimes(1)
    expect(test.tracks).toHaveLength(0)
})
