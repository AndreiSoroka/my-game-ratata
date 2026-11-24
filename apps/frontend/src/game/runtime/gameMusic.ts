import { AudioContextFactory, type Sound, type SoundTrack } from 'excalibur'

import { isAudioMuted } from './audioPreference'
import type { WorldAmbienceSounds } from './worldAmbienceSounds'

const fadeIntoBattleMs = 1500
const fadeOutOfBattleMs = 2500
// SoundTrack applies gain changes with a 100 ms time constant.
const settleGainMs = 300

/** Crossfades the owned tracks while preserving exploration and battle playback positions. */
export class GameMusic {
    private requested = false
    private suspended = false
    private disposed = false
    private inBattle = false
    private explorationTrack: SoundTrack | undefined
    private battleTrack: SoundTrack | undefined
    private battleStartFailed = false
    private mix = 0
    private settledForMs = 0

    public constructor(
        private readonly explorationSound: Sound,
        private readonly battleBank?: Pick<WorldAmbienceSounds, 'request' | 'isReady' | 'play'>,
        private readonly audioRunning = () => AudioContextFactory.create().state === 'running'
    ) {}

    public get hasBattleTrack(): boolean {
        return this.battleTrack !== undefined && !this.battleTrack.isStopped
    }

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
        this.battleStartFailed = false
        this.settledForMs = 0
        if (active) this.prepareBattle()
        this.syncPlayback()
    }

    public resetBattle(): void {
        if (this.disposed) return
        this.inBattle = false
        this.battleStartFailed = false
        this.settledForMs = 0
        this.stopBattleTrack()
        this.setMix(0)
        this.syncPlayback()
    }

    public update(elapsedMs: number): void {
        if (!this.canPlay() || (!this.inBattle && !this.battleTrack)) return
        this.syncPlayback()
        if (!this.battleTrack) return
        if (this.inBattle && (!this.battleTrack.isPlaying || !this.audioRunning())) return
        this.advanceMix(Math.max(0, elapsedMs))
    }

    public pause(): void {
        this.suspended = true
        if (this.battleTrack?.isPlaying) this.battleTrack.pause()
        if (this.explorationTrack?.isPlaying) this.explorationTrack.pause()
    }

    public resume(): void {
        this.suspended = false
        this.syncPlayback()
    }

    public stop(): void {
        if (this.disposed) return
        this.suspended = true
        this.explorationTrack?.stop()
        this.explorationTrack = undefined
        this.resetBattle()
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

    private syncPlayback(): void {
        if (!this.canPlay()) return
        if (this.battleTrack?.isStopped) {
            this.battleTrack = undefined
            this.battleStartFailed = this.inBattle
            this.setMix(0)
        }
        if (this.inBattle || this.battleTrack) this.playBattle()
        if (this.mix < 1 || !this.inBattle || !this.battleTrack?.isPlaying) this.playExploration()
    }

    private playBattle(): void {
        if (this.battleTrack?.isPlaying || this.battleStartFailed) return
        const bank = this.battleBank
        if (!bank?.isReady('forestBattle')) return

        try {
            if (!this.audioRunning()) return
            if (this.battleTrack?.isPaused) void this.battleTrack.play().catch(() => {})
            else this.battleTrack = bank.play('forestBattle', { loop: true, volume: 0 })
        } catch {
            // Playback failures leave exploration available.
        }

        this.battleStartFailed = !this.battleTrack?.isPlaying
    }

    private playExploration(): void {
        if (this.explorationTrack?.isPlaying) return
        try {
            if (this.explorationTrack?.isPaused) void this.explorationTrack.play().catch(() => {})
            else
                this.explorationTrack =
                    this.explorationSound.start({ volume: equalPowerGain(1 - this.mix) }) ??
                    undefined
        } catch {
            // Playback can be retried when the user enables audio or returns to the tab.
        }
    }

    private advanceMix(elapsedMs: number): void {
        const target = Number(this.inBattle)
        if (this.mix !== target) {
            const duration = this.inBattle ? fadeIntoBattleMs : fadeOutOfBattleMs
            const step = elapsedMs / duration
            this.setMix(this.inBattle ? Math.min(1, this.mix + step) : Math.max(0, this.mix - step))
            return
        }

        this.settledForMs += elapsedMs
        if (this.settledForMs < settleGainMs) return
        if (!this.inBattle) this.stopBattleTrack()
        else if (this.explorationTrack?.isPlaying) this.explorationTrack.pause()
    }

    private setMix(mix: number): void {
        this.mix = mix
        setVolume(this.explorationTrack, equalPowerGain(1 - mix))
        setVolume(this.battleTrack, equalPowerGain(mix))
    }

    private stopBattleTrack(): void {
        this.battleTrack?.stop()
        this.battleTrack = undefined
    }
}

function equalPowerGain(mix: number): number {
    return Math.sin((mix * Math.PI) / 2)
}

function setVolume(track: SoundTrack | undefined, volume: number): void {
    if (track && track.volume !== volume) track.volume = volume
}
