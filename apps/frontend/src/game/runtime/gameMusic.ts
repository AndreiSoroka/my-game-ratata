import { AudioContextFactory, type Sound, type SoundTrack } from 'excalibur'

import { isAudioMuted } from './audioPreference'
import type { WorldAmbienceSounds } from './worldAmbienceSounds'

/** Keeps the default music position while a forest battle track is playing. */
export class GameMusic {
    private requested = false
    private suspended = false
    private disposed = false
    private inBattle = false
    private battleTrack: SoundTrack | undefined
    private battleStartFailed = false

    public constructor(
        private readonly defaultTrack: Sound,
        private readonly battleBank?: Pick<WorldAmbienceSounds, 'request' | 'isReady' | 'play'>,
        private readonly audioRunning = () => AudioContextFactory.create().state === 'running'
    ) {}

    public start(): void {
        this.requested = true
        this.resume()
    }

    public prepareBattle(): void {
        if (this.disposed || document.hidden || isAudioMuted()) return
        this.battleBank?.request('forestBattle')
    }

    public setBattle(active: boolean): void {
        if (this.disposed || active === this.inBattle) return
        this.inBattle = active
        if (!active) this.stopBattleTrack()
        this.sync()
    }

    /** Recheck an active battle after the optional clip loads or browser audio unlocks. */
    public update(): void {
        if (
            !this.inBattle ||
            this.battleTrack?.isPlaying ||
            this.battleStartFailed ||
            !this.canPlay()
        )
            return
        if (!this.syncBattle() && this.battleStartFailed) void this.resumeDefault()
    }

    public pause(): void {
        this.suspended = true
        if (this.battleTrack?.isPlaying) this.battleTrack.pause()
        else if (this.defaultTrack.isPlaying) this.defaultTrack.pause()
    }

    public resume(): void {
        this.suspended = false
        this.sync()
    }

    public stop(): void {
        if (this.disposed) return
        this.suspended = true
        this.stopBattleTrack()
        this.defaultTrack.stop()
    }

    public dispose(): void {
        this.stop()
        this.disposed = true
    }

    private canPlay(): boolean {
        return (
            this.requested &&
            !this.suspended &&
            !this.disposed &&
            !document.hidden &&
            !isAudioMuted()
        )
    }

    private sync(): void {
        if (!this.canPlay()) return
        if (this.inBattle) {
            if (this.battleTrack?.isPlaying) return
            this.prepareBattle()
            if (!this.battleStartFailed && this.syncBattle()) return
        }
        void this.resumeDefault()
    }

    private syncBattle(): boolean {
        const bank = this.battleBank
        if (!bank || !bank.isReady('forestBattle')) return false

        try {
            if (!this.audioRunning()) return this.battleTrack?.isPaused === true
            if (this.battleTrack?.isPaused) {
                void this.battleTrack.play().catch(() => {})
            } else {
                this.battleTrack = bank.play('forestBattle', { loop: true })
            }
        } catch {
            // Device failures leave the default soundtrack available.
        }

        if (!this.battleTrack?.isPlaying) {
            this.battleStartFailed = true
            return false
        }

        if (this.defaultTrack.isPlaying) this.defaultTrack.pause()
        return true
    }

    private async resumeDefault(): Promise<void> {
        if (this.defaultTrack.isPlaying) return
        try {
            if (this.defaultTrack.isPaused) await this.defaultTrack.resume()
            else await this.defaultTrack.play()
        } catch {
            // Playback can be retried when the user enables audio or returns to the tab.
        }
    }

    private stopBattleTrack(): void {
        this.battleTrack?.stop()
        this.battleTrack = undefined
        this.battleStartFailed = false
    }
}
