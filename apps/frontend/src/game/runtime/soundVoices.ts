import type { PlayOptions, Sound, SoundTrack } from 'excalibur'

import { isAudioMuted } from './audioPreference'

/** Owns only the tracks started by this player, including their individual gains. */
export class SoundVoices {
    private readonly voices = new Set<SoundTrack>()

    public constructor(private readonly limit: number) {}

    public play(sound: Sound | undefined, options: PlayOptions): void {
        if (!sound?.isLoaded || isAudioMuted() || this.voices.size >= this.limit) return
        try {
            const voice = sound.start(options)
            if (voice === null) return
            this.voices.add(voice)
            void voice.done.then(
                () => this.voices.delete(voice),
                () => {
                    if (this.voices.delete(voice)) voice.stop()
                }
            )
        } catch {
            // An unavailable audio device should not interrupt gameplay feedback.
        }
    }

    public stop(): void {
        for (const voice of this.voices) voice.stop()
        this.voices.clear()
    }
}
