import { AudioContextFactory, type SoundTrack } from 'excalibur'

import type { MusicProfile } from '../assets/musicProfiles'
import { musicCatalog, type MusicId } from '../assets/soundCatalog'
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
    private profile: MusicProfile = { exploration: null, battle: null }
    private explorationTrack: SoundTrack | undefined
    private battleTrack: SoundTrack | undefined
    private explorationStartFailed = false
    private battleStartFailed = false
    private mix = 0
    private settledForMs = 0

    public constructor(
        private readonly bank?: Pick<WorldAmbienceSounds, 'request' | 'isReady' | 'play'>,
        private readonly audioRunning = () => AudioContextFactory.create().state === 'running'
    ) {}

    public start(): void {
        this.requested = true
        this.resume()
    }

    public setProfile(profile: MusicProfile): void {
        if (
            this.disposed ||
            (this.profile.exploration === profile.exploration &&
                this.profile.battle === profile.battle)
        )
            return
        if (this.profile.exploration !== profile.exploration) {
            this.stopExplorationTrack()
            this.explorationStartFailed = false
        }
        this.profile = profile
        this.prepareMusic()
        this.resetBattle()
    }

    public setBattle(active: boolean): void {
        if (
            this.disposed ||
            active === this.inBattle ||
            this.profile.exploration === this.profile.battle
        )
            return
        this.inBattle = active
        this.explorationStartFailed = false
        this.battleStartFailed = false
        this.settledForMs = 0
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
        if (!this.canPlay()) return
        this.syncPlayback()
        if (!this.inBattle && !this.battleTrack && this.mix === 0) return
        if (
            this.inBattle &&
            this.profile.battle !== null &&
            (!this.battleTrack?.isPlaying || !this.audioRunning())
        )
            return
        this.advanceMix(Math.max(0, elapsedMs))
    }

    public pause(): void {
        this.suspended = true
        if (this.battleTrack?.isPlaying) this.battleTrack.pause()
        if (this.explorationTrack?.isPlaying) this.explorationTrack.pause()
    }

    public resume(): void {
        this.suspended = false
        this.explorationStartFailed = false
        this.battleStartFailed = false
        this.prepareMusic()
        this.syncPlayback()
    }

    public stop(): void {
        if (this.disposed) return
        this.suspended = true
        this.stopExplorationTrack()
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

    private prepareMusic(): void {
        if (!this.canPlay()) return
        const { exploration, battle } = this.profile
        if (exploration !== null) this.bank?.request(exploration)
        if (battle !== null && battle !== exploration) this.bank?.request(battle)
    }

    private syncPlayback(): void {
        if (!this.canPlay()) return
        if (this.battleTrack?.isStopped) {
            this.battleTrack = undefined
            this.battleStartFailed = this.inBattle
            this.setMix(0)
        }
        if (this.inBattle || this.battleTrack) this.playBattle()
        if (this.mix < 1 || !this.inBattle) this.playExploration()
    }

    private playBattle(): void {
        const id = this.profile.battle
        if (this.battleStartFailed || !this.canStartTrack(id, this.battleTrack)) return
        this.battleTrack = this.playTrack(id, this.battleTrack, equalPowerGain(this.mix))
        this.battleStartFailed = !this.battleTrack?.isPlaying
    }

    private playExploration(): void {
        const id = this.profile.exploration
        if (this.explorationStartFailed || !this.canStartTrack(id, this.explorationTrack)) return
        this.explorationTrack = this.playTrack(
            id,
            this.explorationTrack,
            equalPowerGain(1 - this.mix)
        )
        this.explorationStartFailed = !this.explorationTrack?.isPlaying
    }

    private canStartTrack(id: MusicId | null, track: SoundTrack | undefined): id is MusicId {
        return (
            id !== null &&
            !track?.isPlaying &&
            this.bank?.isReady(id) === true &&
            this.audioRunning()
        )
    }

    private playTrack(
        id: MusicId,
        track: SoundTrack | undefined,
        volume: number
    ): SoundTrack | undefined {
        try {
            if (track?.isPaused) {
                void track.play().catch(() => {})
                return track
            }
            return this.bank?.play(id, { loop: musicCatalog[id].loop, volume })
        } catch {
            return track
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

    private stopExplorationTrack(): void {
        this.explorationTrack?.stop()
        this.explorationTrack = undefined
    }
}

function equalPowerGain(mix: number): number {
    return Math.sin((mix * Math.PI) / 2)
}

function setVolume(track: SoundTrack | undefined, volume: number): void {
    if (track && track.volume !== volume) track.volume = volume
}
