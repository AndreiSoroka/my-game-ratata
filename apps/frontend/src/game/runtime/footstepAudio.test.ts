import type { Sound } from 'excalibur'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { GameSoundId } from '../assets/soundCatalog'
import { FootstepAudio } from './footstepAudio'
import type { Footstep } from './footsteps'

interface TestVoice {
    source: AudioBuffer
    volume: number
    playbackRate: number
    stop: ReturnType<typeof vi.fn>
    finish: () => void
    fail: () => void
}
const audio = vi.hoisted(() => ({ voices: [] as TestVoice[] }))
vi.mock('excalibur', () => ({
    WebAudioInstance: class {
        public volume = 1
        public playbackRate = 1
        public readonly source: AudioBuffer
        public finish!: () => void
        public fail!: () => void
        private readonly completion: Promise<boolean>
        public constructor(source: AudioBuffer) {
            this.source = source
            this.completion = new Promise((resolve, reject) => {
                this.finish = () => resolve(true)
                this.fail = () => reject(new Error('Audio playback interrupted'))
            })
            audio.voices.push(this)
        }
        public play(): Promise<boolean> {
            return this.completion
        }
        public readonly stop = vi.fn<() => void>(() => this.finish())
    },
}))
function clip(label: string, loaded = true): Sound {
    return {
        data: { label },
        volume: 0.73,
        isLoaded: () => loaded,
        play: vi.fn<() => Promise<boolean>>(),
    } as unknown as Sound
}
function step(volume = 1, changes: Partial<Footstep> = {}): Footstep {
    return { actorId: 'walker', surface: 'grass', variant: 0, volume, slime: false, ...changes }
}
async function settle(): Promise<void> {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
}
afterEach(() => {
    audio.voices.length = 0
})

describe('independent footstep voices', () => {
    it('keeps simultaneous walkers on the same sample at independent gains and playback rates', () => {
        const grass = clip('grass0')
        const player = new FootstepAudio(
            new Map([
                ['stepGrass0', grass],
                ['stepGrass2', grass],
            ])
        )
        player.play(step(1))
        const near = audio.voices[0]!
        player.play(step(0.25, { actorId: 'distant', variant: 2 }))
        const far = audio.voices[1]!
        expect(near).not.toBe(far)
        expect(near.source).toBe(far.source)
        expect(near.volume).toBeCloseTo(0.19)
        expect(far.volume).toBeCloseTo(0.19 * 0.25)
        expect(near.playbackRate).toBe(0.96)
        expect(far.playbackRate).toBe(1.04)
        expect(grass.volume).toBe(0.73)
        expect(grass.play).not.toHaveBeenCalled()
        player.stop()
    })
    it('selects material and slime samples, applies dirt gain and skips unloaded clips', () => {
        const clips = new Map<GameSoundId, Sound>([
            ['stepGrass0', clip('grass')],
            ['stepStone0', clip('stone')],
            ['stepWood0', clip('wood')],
            ['slimeHop', clip('slime')],
            ['stepGrass1', clip('unloaded', false)],
        ])
        const player = new FootstepAudio(clips)
        player.play(step(0.5, { surface: 'dirt' }))
        player.play(step(0.5, { surface: 'stone' }))
        player.play(step(0.5, { surface: 'wood' }))
        player.play(step(0.5, { surface: 'stone', slime: true }))
        player.play(step(1, { variant: 1 }))
        expect(audio.voices.map((voice) => voice.source)).toEqual([
            clips.get('stepGrass0')?.data,
            clips.get('stepStone0')?.data,
            clips.get('stepWood0')?.data,
            clips.get('slimeHop')?.data,
        ])
        expect(audio.voices.map((voice) => voice.volume)).toEqual([
            0.19 * 0.5 * 0.75,
            0.23 * 0.5,
            0.2 * 0.5,
            0.1 * 0.5,
        ])
        player.stop()
    })
    it('caps active voices at eight and releases completed and rejected voices before reuse', async () => {
        const player = new FootstepAudio(new Map([['stepGrass0', clip('grass')]]))
        for (let index = 0; index < 12; index += 1) {
            player.play(step())
        }
        expect(audio.voices).toHaveLength(8)
        const ended = audio.voices[0]!
        ended.finish()
        await settle()
        expect(ended.stop).toHaveBeenCalledOnce()
        player.play(step())
        expect(audio.voices).toHaveLength(9)
        const interrupted = audio.voices[1]!
        interrupted.fail()
        await settle()
        expect(interrupted.stop).toHaveBeenCalledOnce()
        player.play(step())
        expect(audio.voices).toHaveLength(10)
        player.stop()
    })
    it('stops every active voice and immediately makes the full voice budget available again', async () => {
        const player = new FootstepAudio(new Map([['stepGrass0', clip('grass')]]))
        for (let index = 0; index < 8; index += 1) {
            player.play(step())
        }
        player.stop()
        await settle()
        expect(audio.voices.every((voice) => voice.stop.mock.calls.length === 1)).toBe(true)
        for (let index = 0; index < 8; index += 1) {
            player.play(step())
        }
        expect(audio.voices).toHaveLength(16)
        player.stop()
    })
})
