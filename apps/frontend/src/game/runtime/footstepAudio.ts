import { type Sound, WebAudioInstance } from 'excalibur'

import { type GameSoundId, soundCatalog } from '../assets/soundCatalog'
import type { Footstep } from './footsteps'

const samples: Record<string, readonly GameSoundId[]> = {
    grass: ['stepGrass0', 'stepGrass1', 'stepGrass2'],
    dirt: ['stepGrass0', 'stepGrass1', 'stepGrass2'],
    stone: ['stepStone0', 'stepStone1', 'stepStone2'],
    wood: ['stepWood0', 'stepWood1', 'stepWood2'],
}

export class FootstepAudio {
    private readonly voices = new Set<WebAudioInstance>()
    public constructor(private readonly sounds: Map<GameSoundId, Sound>) {}

    public play(step: Footstep): void {
        if (this.voices.size >= 8) return
        const sample = step.slime ? 'slimeHop' : samples[step.surface]?.[step.variant]
        const sound = sample === undefined ? undefined : this.sounds.get(sample)
        if (sound === undefined || sample === undefined || !sound.isLoaded()) return
        // Sound.play(volume) changes every existing track's gain in Excalibur 0.32.
        // Separate instances keep each walker's distance independent.
        const voice = new WebAudioInstance(sound.data)
        voice.volume =
            soundCatalog[sample].volume * step.volume * (step.surface === 'dirt' ? 0.75 : 1)
        voice.playbackRate = [0.96, 1, 1.04][step.variant] ?? 1
        this.voices.add(voice)
        void voice
            .play()
            .catch(() => undefined)
            .finally(() => {
                if (this.voices.delete(voice)) voice.stop()
            })
    }

    public stop(): void {
        for (const voice of this.voices) voice.stop()
        this.voices.clear()
    }
}
