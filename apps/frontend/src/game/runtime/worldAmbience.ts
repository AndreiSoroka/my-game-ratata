import type { AdventureResourceNode, Vector2, WorldSnapshot } from '@my-game-ratata/contracts'
import { AudioContextFactory, type Engine, type SoundTrack } from 'excalibur'

import { isAudioMuted } from './audioPreference'
import { containsPosition } from './mapBuildings'
import type { RenderedTiledMap } from './tiledMap'
import {
    type AmbienceSoundId,
    type LoadAmbienceSound,
    WorldAmbienceSounds,
} from './worldAmbienceSounds'

type AmbienceMap = Pick<RenderedTiledMap, 'tileWidth' | 'tileHeight' | 'buildings'>

interface WorldAmbienceOptions {
    now?: () => number
    random?: () => number
    loadSound?: LoadAmbienceSound
    audioContext?: () => Pick<AudioContext, 'state' | 'resume'>
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

const birds = ['bird1', 'bird2'] as const
const forestSounds = [...birds, 'wind'] as const

/** Client-only sounds derived from the local player's current view. */
export class WorldAmbience {
    private readonly sounds: WorldAmbienceSounds
    private readonly now: () => number
    private readonly random: () => number
    private readonly audioContext: NonNullable<WorldAmbienceOptions['audioContext']>
    private active = false
    private disposed = false
    private map: (AmbienceMap & { locationId: string }) | undefined
    private portals: AudiblePortal[] = []
    private serverClockOffset = 0
    private portalVoice: PortalVoice | undefined
    private failedPortalStart: string | undefined
    private inForest = false
    private forestVoice: SoundTrack | undefined
    private forestDueAt: number | undefined

    public constructor(
        private readonly engine: Pick<Engine, 'on' | 'off'>,
        options: WorldAmbienceOptions = {}
    ) {
        this.sounds = new WorldAmbienceSounds(options.loadSound)
        this.now = options.now ?? (() => performance.now())
        this.random = options.random ?? Math.random
        this.audioContext = options.audioContext ?? (() => AudioContextFactory.create())
    }

    public start(): void {
        if (this.active || this.disposed) return
        this.active = true
        this.engine.on('postupdate', this.update)
        document.addEventListener('click', this.resumeOnGesture, true)
        document.addEventListener('keydown', this.resumeOnGesture, true)
    }

    public setMap(locationId: string, map: AmbienceMap): void {
        this.clear()
        const { buildings, tileWidth, tileHeight } = map
        this.map = { locationId, buildings, tileWidth, tileHeight }
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
            const distance = tileDistance(listener.position, portal.position, map)
            return [{ id: portal.id, expiresAt: portal.expiresAt, distance }]
        })
        this.inForest = hasWoodland(snapshot, listener.position, map, this.inForest)
        if (!this.inForest) this.stopForest()
    }

    /** Invalidate observations and voices while keeping the applied map available for resume. */
    public clear(): void {
        this.portals = []
        this.inForest = false
        this.clearPlayback()
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
        this.sounds.dispose()
    }

    private readonly resumeOnGesture = (event: Event): void => {
        if (!event.isTrusted || document.hidden || isAudioMuted()) return
        const context = this.audioContext()
        if (context.state === 'running' || context.state === 'closed') return
        void context.resume().catch(() => undefined)
    }

    private readonly update = (): void => {
        if (!this.inForest && this.portals.length === 0 && !this.portalVoice) return
        if (this.audioContext().state !== 'running') {
            this.clearPlayback()
            return
        }
        const now = this.now()
        this.updatePortal(now)
        if (this.inForest) this.updateForest(now)
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
        setPortalGain(this.portalVoice.track, nearest.distance)
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

    private updateForest(now: number): void {
        for (const id of forestSounds) this.sounds.request(id)
        if (this.forestVoice) {
            if (!this.forestVoice.isStopped) return
            this.forestVoice = undefined
            this.forestDueAt = this.forestDeadline(now, 16000, 35000)
        }
        this.forestDueAt ??= this.forestDeadline(now, 5000, 10000)
        if (now < this.forestDueAt) return

        const sample = this.pickForestSound()
        this.forestVoice = sample && this.sounds.play(sample)
        if (this.forestVoice) this.forestDueAt = undefined
        else this.forestDueAt = this.forestDeadline(now, 16000, 35000)
    }

    private pickForestSound(): AmbienceSoundId | undefined {
        const availableBirds = birds.filter((id) => this.sounds.isReady(id))
        const wind = this.sounds.isReady('wind')
        if (wind && (availableBirds.length === 0 || this.random() >= 2 / 3)) return 'wind'
        return availableBirds[Math.floor(this.random() * availableBirds.length)]
    }

    private forestDeadline(now: number, minimum: number, maximum: number): number {
        return now + minimum + this.random() * (maximum - minimum)
    }

    private clearPlayback(): void {
        this.stopPortal()
        this.failedPortalStart = undefined
        this.stopForest()
    }

    private stopPortal(): void {
        this.portalVoice?.track.stop()
        this.portalVoice = undefined
    }

    private stopForest(): void {
        this.forestVoice?.stop()
        this.forestVoice = undefined
        this.forestDueAt = undefined
    }
}

function tileDistance(from: Vector2, to: Vector2, map: AmbienceMap): number {
    return Math.hypot((from.x - to.x) / map.tileWidth, (from.y - to.y) / map.tileHeight)
}

function setPortalGain(track: SoundTrack, distance: number): void {
    const gain = Math.min(1, (12 - distance) / 9) ** 2
    // Excalibur ramps the live per-track gain. Keep quiet and full-volume endpoints exact.
    if (
        track.volume !== gain &&
        (track.volume === 0 || gain === 1 || Math.abs(track.volume - gain) >= 0.02)
    )
        track.volume = gain
}

function hasWoodland(
    snapshot: WorldSnapshot,
    listener: Vector2,
    map: AmbienceMap & { locationId: string },
    wasInForest: boolean
): boolean {
    if (
        snapshot.location?.biome === 'city' ||
        map.buildings.some((building) => containsPosition(building, listener))
    )
        return false
    const radius = wasInForest ? 11 : 10
    const minimumTrees = wasInForest ? 2 : 3
    let nearby = 0
    for (const tree of snapshot.adventure?.resourceNodes ?? []) {
        if (
            isStandingMatureTree(tree, map.locationId) &&
            tileDistance(listener, tree.position, map) <= radius
        )
            nearby += 1
        if (nearby >= minimumTrees) return true
    }
    return false
}

function isStandingMatureTree(tree: AdventureResourceNode, locationId: string): boolean {
    return (
        tree.locationId === locationId &&
        tree.source === 'tree' &&
        tree.treeSize === 'adult' &&
        tree.phase === 'ready'
    )
}
