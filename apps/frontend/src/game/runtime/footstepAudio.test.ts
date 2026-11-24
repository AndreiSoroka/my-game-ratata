import type { PlayOptions, Sound, SoundTrack } from 'excalibur'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { GameSoundId } from '../assets/soundCatalog'
import { FootstepAudio } from './footstepAudio'
import type { Footstep } from './footsteps'

function makeVoice(source: string, volume: number, options: PlayOptions = {}) {
    let finish!: () => void
    let fail!: () => void
    const done = new Promise<boolean>((resolve, reject) => {
        finish = () => resolve(true)
        fail = () => reject(new Error('Audio playback interrupted'))
    })
    return {
        source,
        gain: volume * (options.volume ?? 1),
        playbackRate: options.playbackRate ?? 1,
        done,
        finish,
        fail,
        stop: vi.fn<() => void>(finish),
    }
}
const voices: ReturnType<typeof makeVoice>[] = []

function clip(label: string, volume = 0.19, loaded = true) {
    const sound = {
        volume,
        isLoaded: loaded,
        start: vi.fn<(options?: PlayOptions) => SoundTrack | null>((options) => {
            const voice = makeVoice(label, sound.volume, options)
            voices.push(voice)
            return voice as unknown as SoundTrack
        }),
    }
    return { sound: sound as unknown as Sound, start: sound.start }
}
function step(volume = 1, changes: Partial<Footstep> = {}): Footstep {
    return { actorId: 'walker', surface: 'grass', variant: 0, volume, slime: false, ...changes }
}
afterEach(() => {
    voices.length = 0
})

describe('independent footstep voices', () => {
    it('keeps simultaneous walkers on the same sample at independent gains and playback rates', () => {
        const { sound: grass } = clip('grass0', 0.73)
        const player = new FootstepAudio(
            new Map([
                ['stepGrass0', grass],
                ['stepGrass2', grass],
            ])
        )
        player.play(step(1))
        const near = voices[0]!
        player.play(step(0.25, { actorId: 'distant', variant: 2 }))
        const far = voices[1]!
        expect(near).not.toBe(far)
        expect(near.source).toBe(far.source)
        expect(near.gain).toBeCloseTo(0.73)
        expect(far.gain).toBeCloseTo(0.73 * 0.25)
        expect(near.playbackRate).toBe(0.96)
        expect(far.playbackRate).toBe(1.04)
        expect(grass.volume).toBe(0.73)
        player.stop()
    })
    it('selects material and slime samples, applies dirt gain and skips unloaded clips', () => {
        const clips = new Map<GameSoundId, Sound>([
            ['stepGrass0', clip('grass').sound],
            ['stepStone0', clip('stone', 0.23).sound],
            ['stepWood0', clip('wood', 0.2).sound],
            ['slimeHop', clip('slime', 0.1).sound],
            ['stepGrass1', clip('unloaded', 0.19, false).sound],
        ])
        const player = new FootstepAudio(clips)
        player.play(step(0.5, { surface: 'dirt' }))
        player.play(step(0.5, { surface: 'stone' }))
        player.play(step(0.5, { surface: 'wood' }))
        player.play(step(0.5, { surface: 'stone', slime: true }))
        player.play(step(1, { variant: 1 }))
        expect(voices.map((voice) => voice.source)).toEqual(['grass', 'stone', 'wood', 'slime'])
        expect(voices.map((voice) => voice.gain)).toEqual([
            0.19 * 0.5 * 0.75,
            0.23 * 0.5,
            0.2 * 0.5,
            0.1 * 0.5,
        ])
        player.stop()
    })
    it('caps active voices at eight and releases completed and rejected voices before reuse', async () => {
        const { sound } = clip('grass')
        const player = new FootstepAudio(new Map([['stepGrass0', sound]]))
        for (let index = 0; index < 12; index += 1) {
            player.play(step())
        }
        expect(voices).toHaveLength(8)
        const ended = voices[0]!
        ended.finish()
        await ended.done
        expect(ended.stop).not.toHaveBeenCalled()
        player.play(step())
        expect(voices).toHaveLength(9)
        const interrupted = voices[1]!
        interrupted.fail()
        await expect(interrupted.done).rejects.toThrow('Audio playback interrupted')
        expect(interrupted.stop).toHaveBeenCalledOnce()
        player.play(step())
        expect(voices).toHaveLength(10)
        player.stop()
    })
    it('stops only its own tracks once and immediately makes the full voice budget available again', async () => {
        const { sound, start } = clip('grass')
        start()
        const unrelatedTrack = voices[0]!
        const player = new FootstepAudio(new Map([['stepGrass0', sound]]))
        for (let index = 0; index < 8; index += 1) {
            player.play(step())
        }
        const firstTracks = voices.slice(1)
        player.stop()
        player.stop()
        for (let index = 0; index < 8; index += 1) {
            player.play(step())
        }
        expect(voices).toHaveLength(17)
        await Promise.all(firstTracks.map((track) => track.done))
        expect(firstTracks.every((track) => track.stop.mock.calls.length === 1)).toBe(true)
        expect(unrelatedTrack.stop).not.toHaveBeenCalled()
        const newTracks = voices.slice(9)
        expect(newTracks.every((track) => track.stop.mock.calls.length === 0)).toBe(true)
        player.play(step())
        expect(voices).toHaveLength(17)
        player.stop()
        unrelatedTrack.stop()
    })
    it('keeps the full budget after Sound.start drops playback or throws', () => {
        const { sound, start } = clip('grass')
        start.mockReturnValueOnce(null).mockImplementationOnce(() => {
            throw new Error('Audio playback interrupted')
        })
        const player = new FootstepAudio(new Map([['stepGrass0', sound]]))
        for (let index = 0; index < 10; index += 1) {
            player.play(step())
        }
        expect(voices).toHaveLength(8)
        player.stop()
    })
})
