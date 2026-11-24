import type { Sound } from 'excalibur'

import type { GameSoundId } from '../assets/soundCatalog'
import type { Footstep } from './footsteps'
import { SoundVoices } from './soundVoices'

const samples: Record<string, readonly GameSoundId[]> = {
    grass: ['stepGrass0', 'stepGrass1', 'stepGrass2'],
    dirt: ['stepGrass0', 'stepGrass1', 'stepGrass2'],
    stone: ['stepStone0', 'stepStone1', 'stepStone2'],
    wood: ['stepWood0', 'stepWood1', 'stepWood2'],
}

export class FootstepAudio {
    private readonly voices = new SoundVoices(8)
    public constructor(private readonly sounds: Map<GameSoundId, Sound>) {}

    public play(step: Footstep): void {
        const sample = step.slime ? 'slimeHop' : samples[step.surface]?.[step.variant]
        const sound = sample === undefined ? undefined : this.sounds.get(sample)
        this.voices.play(sound, {
            volume: step.volume * (step.surface === 'dirt' ? 0.75 : 1),
            playbackRate: [0.96, 1, 1.04][step.variant] ?? 1,
        })
    }

    public stop(): void {
        this.voices.stop()
    }
}
