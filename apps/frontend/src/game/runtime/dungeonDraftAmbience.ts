import type { SoundTrack } from 'excalibur'

import type { WorldAmbienceSounds } from './worldAmbienceSounds'

const draftGain = 0.42
const draftFadeMs = 400
const snapshotGraceMs = 500

/** One quiet hint driven by the latest private observation on the current floor. */
export class DungeonDraftAmbience {
    private audibleUntil: number | undefined
    private track: SoundTrack | undefined
    private stopAt: number | undefined
    private startFailed = false

    public constructor(private readonly sounds: WorldAmbienceSounds) {}

    public get hasWork(): boolean {
        return this.audibleUntil !== undefined || this.track !== undefined
    }

    public observe(audible: boolean, now: number): void {
        this.audibleUntil = audible ? now + snapshotGraceMs : undefined
    }

    public update(now: number): void {
        if (this.audibleUntil === undefined || now >= this.audibleUntil) {
            this.audibleUntil = undefined
            this.startFailed = false
            this.fade(now)
            return
        }

        this.stopAt = undefined
        if (this.track?.isStopped) this.track = undefined
        this.track ??= this.start()
        // Excalibur ramps the live track gain over the playing source.
        if (this.track && this.track.volume !== draftGain) this.track.volume = draftGain
    }

    public clear(): void {
        this.audibleUntil = undefined
        this.stopPlayback()
    }

    public stopPlayback(): void {
        this.track?.stop()
        this.track = undefined
        this.stopAt = undefined
        this.startFailed = false
    }

    private start(): SoundTrack | undefined {
        this.sounds.request('wind')
        if (this.startFailed || !this.sounds.isReady('wind')) return undefined
        // Start past the recording’s leading fade and lower its pitch underground.
        const track = this.sounds.play('wind', {
            loop: true,
            position: 650,
            pitch: -300,
            volume: 0,
        })
        this.startFailed = track === undefined
        return track
    }

    private fade(now: number): void {
        if (!this.track) return
        if (this.stopAt === undefined) {
            this.track.volume = 0
            this.stopAt = now + draftFadeMs
        }
        if (this.track.isStopped || now >= this.stopAt) this.stopPlayback()
    }
}
