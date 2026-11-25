import type { AdventureResourceNode, Vector2, WorldSnapshot } from '@my-game-ratata/contracts'
import type { SoundTrack } from 'excalibur'

import { distanceInTiles, distanceToWater, isNearFortification } from './mapAmbientTerrain'
import { containsPosition } from './mapBuildings'
import type { RenderedTiledMap } from './tiledMap'
import type { AmbienceSoundId, WorldAmbienceSounds } from './worldAmbienceSounds'

export type AmbienceMap = Pick<
    RenderedTiledMap,
    'tileWidth' | 'tileHeight' | 'buildings' | 'ambientTerrain'
> & { underground?: boolean }

type CueArea = 'forest' | 'fortification'
interface CueVoice {
    id: AmbienceSoundId
    track: SoundTrack
    stopAt?: number
}

const birds = ['bird1', 'bird2'] as const
const forestSounds = [...birds, 'wind'] as const
const cueIntervals = {
    forest: { first: [5000, 10000], next: [16000, 35000] },
    fortification: { first: [8000, 15000], next: [25000, 50000] },
} as const
const waterRadius = 5
const waterFullVolumeDistance = 1
const fortificationRadius = 4
const windFadeMs = 400

/** One continuous shore loop and a shared forest/fortification one-shot slot. */
export class TerrainAmbience {
    private waterGain = 0
    private waterVoice: SoundTrack | undefined
    private waterStopAt: number | undefined
    private waterStartFailed = false
    private woodland = false
    private cueArea: CueArea | undefined
    private cueVoice: CueVoice | undefined
    private cueDueAt: number | undefined

    public constructor(
        private readonly sounds: WorldAmbienceSounds,
        private readonly random: () => number
    ) {}

    public get hasWork(): boolean {
        return (
            this.waterGain > 0 ||
            this.waterVoice !== undefined ||
            this.cueArea !== undefined ||
            this.cueVoice !== undefined
        )
    }

    public observe(
        snapshot: WorldSnapshot,
        listener: Vector2,
        map: AmbienceMap & { locationId: string },
        now: number
    ): void {
        if (
            map.underground ||
            map.buildings.some((building) => containsPosition(building, listener))
        ) {
            this.waterGain = 0
            this.waterStartFailed = false
            this.stopWater()
            this.woodland = false
            this.setCueArea(undefined, now)
            return
        }
        const terrain = map.ambientTerrain
        const distance = terrain ? distanceToWater(terrain, listener, map, waterRadius) : Infinity
        this.waterGain =
            Math.min(
                1,
                Math.max(0, (waterRadius - distance) / (waterRadius - waterFullVolumeDistance))
            ) ** 2
        const nearWall = terrain && isNearFortification(terrain, listener, map, fortificationRadius)
        this.woodland = hasWoodland(snapshot, listener, map, this.woodland)
        const area = nearWall ? 'fortification' : this.woodland ? 'forest' : undefined
        this.setCueArea(area, now)
    }

    public clear(): void {
        this.waterGain = 0
        this.woodland = false
        this.cueArea = undefined
        this.stopPlayback()
    }

    public stopPlayback(): void {
        this.stopWater()
        this.waterStartFailed = false
        this.stopCue()
    }

    public update(now: number): void {
        this.updateWater(now)
        const voice = this.cueVoice
        if (voice?.stopAt !== undefined) {
            if (!voice.track.isStopped && now < voice.stopAt) return
            this.stopCue()
        }
        if (this.cueArea) this.updateCue(now, this.cueArea)
    }

    private setCueArea(area: CueArea | undefined, now: number): void {
        if (area === this.cueArea) return
        this.cueArea = area
        this.cueDueAt = undefined
        const voice = this.cueVoice
        if (voice?.id !== 'wind' || voice.track.isStopped) {
            this.stopCue()
            return
        }
        if (voice.stopAt !== undefined) return
        voice.track.volume = 0
        voice.stopAt = now + windFadeMs
    }

    private updateWater(now: number): void {
        if (this.waterGain === 0) {
            this.waterStartFailed = false
            this.fadeWater(now)
            return
        }
        this.waterStopAt = undefined
        if (this.waterVoice?.isStopped) this.stopWater()
        this.waterVoice ??= this.startWater()
        if (this.waterVoice) setAmbienceGain(this.waterVoice, this.waterGain)
    }

    private startWater(): SoundTrack | undefined {
        this.sounds.request('water')
        if (this.waterStartFailed || !this.sounds.isReady('water')) return undefined
        const track = this.sounds.play('water', { loop: true, volume: 0 })
        this.waterStartFailed = track === undefined
        return track
    }

    private fadeWater(now: number): void {
        if (!this.waterVoice) return
        if (this.waterStopAt === undefined) {
            this.waterVoice.volume = 0
            this.waterStopAt = now + 400
        }
        if (now >= this.waterStopAt) this.stopWater()
    }

    private stopWater(): void {
        this.waterVoice?.stop()
        this.waterVoice = undefined
        this.waterStopAt = undefined
    }

    private updateCue(now: number, area: CueArea): void {
        const intervals = cueIntervals[area]
        if (area === 'forest') {
            for (const id of forestSounds) this.sounds.request(id)
        } else {
            this.sounds.request('wind')
        }
        if (this.cueVoice) {
            if (!this.cueVoice.track.isStopped) return
            this.cueVoice = undefined
            this.cueDueAt = this.deadline(now, intervals.next)
        }
        this.cueDueAt ??= this.deadline(now, intervals.first)
        if (now < this.cueDueAt) return

        this.cueVoice = this.startCue(area)
        this.cueDueAt = this.cueVoice ? undefined : this.deadline(now, intervals.next)
    }

    private startCue(area: CueArea): CueVoice | undefined {
        const wall = area === 'fortification'
        const id = wall ? 'wind' : this.pickForestSound()
        if (!id) return undefined
        const track = this.sounds.play(id, wall ? { volume: 0.5 } : undefined)
        return track && { id, track }
    }

    private pickForestSound(): AmbienceSoundId | undefined {
        const availableBirds = birds.filter((id) => this.sounds.isReady(id))
        const wind = this.sounds.isReady('wind')
        if (wind && (availableBirds.length === 0 || this.random() >= 2 / 3)) return 'wind'
        return availableBirds[Math.floor(this.random() * availableBirds.length)]
    }

    private deadline(now: number, [minimum, maximum]: readonly [number, number]): number {
        return now + minimum + this.random() * (maximum - minimum)
    }

    private stopCue(): void {
        this.cueVoice?.track.stop()
        this.cueVoice = undefined
        this.cueDueAt = undefined
    }
}

export function setAmbienceGain(track: SoundTrack, gain: number): void {
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
    if (snapshot.location?.biome === 'city') return false
    const radius = wasInForest ? 11 : 10
    const minimumTrees = wasInForest ? 2 : 3
    let nearby = 0
    for (const tree of snapshot.adventure?.resourceNodes ?? []) {
        if (
            isStandingMatureTree(tree, map.locationId) &&
            distanceInTiles(listener, tree.position, map) <= radius
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
