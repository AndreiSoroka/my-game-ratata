import type { Sound, SoundTrack } from 'excalibur'

import type { GameSoundId } from '../assets/soundCatalog'
import { isAudioMuted } from './audioPreference'
import type { Footstep } from './footsteps'

const samples: Record<string, readonly GameSoundId[]> = {
    grass: ['stepGrass0', 'stepGrass1', 'stepGrass2'],
    dirt: ['stepGrass0', 'stepGrass1', 'stepGrass2'],
    stone: ['stepStone0', 'stepStone1', 'stepStone2'],
    wood: ['stepWood0', 'stepWood1', 'stepWood2'],
}

export class FootstepAudio {
    private readonly voices = new Set<SoundTrack>()
    public constructor(private readonly sounds: Map<GameSoundId, Sound>) {}

    public play(step: Footstep): void {
        if (isAudioMuted() || this.voices.size >= 8) return
        const sample = step.slime ? 'slimeHop' : samples[step.surface]?.[step.variant]
        const sound = sample === undefined ? undefined : this.sounds.get(sample)
        if (!sound?.isLoaded) return
        try {
            // Excalibur multiplies this track gain by the Sound's authored gain.
            const track = sound.start({
                volume: step.volume * (step.surface === 'dirt' ? 0.75 : 1),
                playbackRate: [0.96, 1, 1.04][step.variant] ?? 1,
            })
            if (track === null) return
            this.voices.add(track)
            void track.done.then(
                () => this.voices.delete(track),
                () => {
                    if (this.voices.delete(track)) track.stop()
                }
            )
        } catch {
            // An unavailable audio device should not interrupt movement presentation.
        }
    }

    public stop(): void {
        for (const voice of this.voices) voice.stop()
        this.voices.clear()
    }
}
