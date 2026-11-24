import type { CharacterSnapshot, GameEventPayload, WorldSnapshot } from '@my-game-ratata/contracts'
import { AudioContextFactory, type SoundTrack } from 'excalibur'

import { footstepGain } from './footsteps'
import type { FootstepMap } from './mapSurfaces'
import type { WorldAmbienceSounds } from './worldAmbienceSounds'

type TileSize = Pick<FootstepMap, 'tileWidth' | 'tileHeight'>

interface DeathView {
    locationId: string
    gains: Map<string, number>
    serverTime: number
}

const maxVoices = 2
const maxReceipts = 256

/** Plays a death cue from the last visible, living human snapshot of its victim. */
export class HumanDeathAudio {
    private view: DeathView | undefined
    private readonly voices = new Map<string, SoundTrack>()
    private readonly heard = new Set<string>()

    public constructor(
        private readonly sounds: Pick<WorldAmbienceSounds, 'request' | 'play'>,
        private readonly audioRunning = () => AudioContextFactory.create().state === 'running'
    ) {}

    public prepare(): void {
        this.sounds.request('humanDeath')
    }

    public observeWorld(
        snapshot: WorldSnapshot,
        localPlayerId: string,
        tileSize: TileSize,
        isVisible: (id: string) => boolean
    ): void {
        if (this.view && snapshot.serverTime < this.view.serverTime) return
        const listener = snapshot.characters.find((actor) => actor.id === localPlayerId)
        const locationId = snapshot.location?.id
        if (!listener?.alive || locationId === undefined) {
            this.clearObservation()
            return
        }
        this.view = {
            locationId,
            serverTime: snapshot.serverTime,
            gains: deathGains(snapshot.characters, listener, tileSize, isVisible),
        }
    }

    public receive(event: GameEventPayload, serverTime: number): void {
        const view = this.view
        const { targetId } = event
        if (!view || event.kind !== 'death' || targetId === undefined) return
        if (isOutsideView(event, serverTime, view)) return
        const receipt = JSON.stringify([targetId, event.eventId ?? event.actionId ?? serverTime])
        if (this.heard.has(receipt)) return
        this.remember(receipt)
        const gain = view.gains.get(targetId)
        if (gain === undefined || !this.audioRunning()) return
        this.playCue(targetId, gain)
    }

    public clearObservation(): void {
        this.view = undefined
    }

    public clear(): void {
        this.clearObservation()
        for (const track of this.voices.values()) {
            if (!track.isStopped) track.stop()
        }
        this.voices.clear()
    }

    public reset(): void {
        this.clear()
        this.heard.clear()
    }

    private remember(receipt: string): void {
        this.heard.add(receipt)
        if (this.heard.size <= maxReceipts) return
        const oldest = this.heard.values().next().value
        if (oldest !== undefined) this.heard.delete(oldest)
    }

    private playCue(targetId: string, gain: number): void {
        for (const [id, track] of this.voices) {
            if (track.isStopped) this.voices.delete(id)
        }
        if (this.voices.has(targetId) || this.voices.size >= maxVoices) return
        const track = this.sounds.play('humanDeath', { volume: gain })
        if (track) this.voices.set(targetId, track)
    }
}

function isOutsideView(event: GameEventPayload, serverTime: number, view: DeathView): boolean {
    return (
        !Number.isFinite(serverTime) ||
        serverTime < view.serverTime ||
        (event.locationId !== undefined && event.locationId !== view.locationId)
    )
}

function deathGains(
    actors: CharacterSnapshot[],
    listener: CharacterSnapshot,
    tileSize: TileSize,
    isVisible: (id: string) => boolean
): Map<string, number> {
    const gains = new Map<string, number>()
    for (const actor of actors) {
        if (!isLivingHuman(actor) || !isVisible(actor.id)) continue
        const distance = Math.hypot(
            (actor.position.x - listener.position.x) / tileSize.tileWidth,
            (actor.position.y - listener.position.y) / tileSize.tileHeight
        )
        const gain = footstepGain(distance - 2, 6)
        if (gain > 0) gains.set(actor.id, gain)
    }
    return gains
}

function isLivingHuman(actor: CharacterSnapshot): boolean {
    return actor.alive && actor.archetype === 'human' && actor.creatureType === 'humanoid'
}
