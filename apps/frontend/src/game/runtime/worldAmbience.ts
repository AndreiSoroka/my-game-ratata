import type { Vector2, WorldSnapshot } from '@my-game-ratata/contracts'
import { AudioContextFactory, type Engine, type SoundTrack } from 'excalibur'

import { isAudioMuted } from './audioPreference'
import { distanceInTiles } from './mapAmbientTerrain'
import { type AmbienceMap, setAmbienceGain, TerrainAmbience } from './terrainAmbience'
import { type LoadAmbienceSound, WorldAmbienceSounds } from './worldAmbienceSounds'

interface WorldAmbienceOptions {
    now?: () => number
    random?: () => number
    loadSound?: LoadAmbienceSound
    audioContext?: () => Pick<AudioContext, 'state' | 'resume'>
    sounds?: WorldAmbienceSounds
}

interface AudiblePortal {
    id: string
    expiresAt: number
    distance: number
}

interface PortalVoice {
    id: string
    track: SoundTrack
    stopAt?: number
}

/** Client-only sounds derived from the local player's current view. */
export class WorldAmbience {
    private readonly sounds: WorldAmbienceSounds
    private readonly ownsSounds: boolean
    private readonly terrain: TerrainAmbience
    private readonly now: () => number
    private readonly audioContext: NonNullable<WorldAmbienceOptions['audioContext']>
    private active = false
    private disposed = false
    private map: (AmbienceMap & { locationId: string }) | undefined
    private portals: AudiblePortal[] = []
    private serverClockOffset = 0
    private portalVoice: PortalVoice | undefined
    private failedPortalStart: string | undefined

    public constructor(
        private readonly engine: Pick<Engine, 'on' | 'off'>,
        options: WorldAmbienceOptions = {}
    ) {
        this.sounds = options.sounds ?? new WorldAmbienceSounds(options.loadSound)
        this.ownsSounds = options.sounds === undefined
        this.terrain = new TerrainAmbience(this.sounds, options.random ?? Math.random)
        this.now = options.now ?? (() => performance.now())
        this.audioContext = options.audioContext ?? (() => AudioContextFactory.create())
    }

    public start(): void {
        if (this.active || this.disposed) return
        this.active = true
        this.engine.on('postupdate', this.update)
        document.addEventListener('click', this.resumeOnGesture, true)
        document.addEventListener('keydown', this.resumeOnGesture, true)
    }

    public get inWoodland(): boolean {
        return this.terrain.inWoodland
    }

    public setMap(locationId: string, map: AmbienceMap): void {
        this.clear()
        this.map = { ...map, locationId }
    }

    public observeWorld(
        snapshot: WorldSnapshot,
        localPlayerId: string,
        isPositionVisible: (position: Vector2) => boolean
    ): void {
        if (!this.active) return
        const map = this.map
        const listener = snapshot.characters.find((character) => character.id === localPlayerId)
        if (
            !map ||
            snapshot.location?.id !== map.locationId ||
            !listener?.alive ||
            listener.tags.includes('offline') ||
            document.hidden ||
            isAudioMuted()
        ) {
            this.clear()
            return
        }

        this.serverClockOffset = snapshot.serverTime - this.now()
        this.portals = (snapshot.portals ?? []).flatMap((portal) => {
            if (
                portal.locationId !== map.locationId ||
                portal.expiresAt <= snapshot.serverTime ||
                !isPositionVisible(portal.position)
            )
                return []
            const distance = distanceInTiles(listener.position, portal.position, map)
            return [{ id: portal.id, expiresAt: portal.expiresAt, distance }]
        })
        this.terrain.observe(snapshot, listener.position, map)
    }

    /** Invalidate observations and voices while keeping the applied map available for resume. */
    public clear(): void {
        this.portals = []
        this.stopPortal()
        this.failedPortalStart = undefined
        this.terrain.clear()
    }

    public dispose(): void {
        if (this.disposed) return
        this.disposed = true
        if (this.active) {
            this.engine.off('postupdate', this.update)
            document.removeEventListener('click', this.resumeOnGesture, true)
            document.removeEventListener('keydown', this.resumeOnGesture, true)
        }
        this.active = false
        this.clear()
        this.map = undefined
        if (this.ownsSounds) this.sounds.dispose()
    }

    private readonly resumeOnGesture = (event: Event): void => {
        if (!event.isTrusted || document.hidden || isAudioMuted()) return
        const context = this.audioContext()
        if (context.state === 'running' || context.state === 'closed') return
        void context.resume().catch(() => undefined)
    }

    private readonly update = (): void => {
        if (!this.terrain.hasWork && this.portals.length === 0 && !this.portalVoice) return
        if (this.audioContext().state !== 'running') {
            this.clearPlayback()
            return
        }
        const now = this.now()
        this.updatePortal(now)
        this.terrain.update(now)
    }

    private updatePortal(now: number): void {
        const nearest = this.reconcilePortals(now + this.serverClockOffset)
        if (!nearest) {
            this.fadePortal(now)
            return
        }

        if (this.portalVoice?.stopAt !== undefined && this.portalVoice.id !== nearest.id)
            this.stopPortal()
        this.portalVoice ??= this.startPortal(nearest.id)
        if (!this.portalVoice) return

        this.portalVoice.id = nearest.id
        this.portalVoice.stopAt = undefined
        setAmbienceGain(this.portalVoice.track, Math.min(1, (12 - nearest.distance) / 9) ** 2)
    }

    private reconcilePortals(serverTime: number): AudiblePortal | undefined {
        let nearest: AudiblePortal | undefined
        let currentIsValid = false
        for (const portal of this.portals) {
            if (portal.expiresAt <= serverTime) continue
            if (portal.id === this.portalVoice?.id) currentIsValid = true
            if (portal.distance < (nearest?.distance ?? 12)) nearest = portal
        }
        if (!currentIsValid || this.portalVoice?.track.isStopped) this.stopPortal()
        return nearest
    }

    private startPortal(id: string): PortalVoice | undefined {
        this.sounds.request('portal')
        if (!this.sounds.isReady('portal') || this.failedPortalStart === id) return undefined
        const track = this.sounds.play('portal', { loop: true, volume: 0 })
        this.failedPortalStart = track ? undefined : id
        return track && { id, track }
    }

    private fadePortal(now: number): void {
        this.failedPortalStart = undefined
        const voice = this.portalVoice
        if (!voice) return
        if (voice.stopAt === undefined) {
            voice.track.volume = 0
            voice.stopAt = now + 400
        }
        if (now >= voice.stopAt) this.stopPortal()
    }

    private clearPlayback(): void {
        this.stopPortal()
        this.failedPortalStart = undefined
        this.terrain.stopPlayback()
    }

    private stopPortal(): void {
        this.portalVoice?.track.stop()
        this.portalVoice = undefined
    }
}
