import {
    type AbilityId,
    type CharacterSnapshot,
    type GameEventPayload,
    isPrayerAction,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'
import { AudioContextFactory, type SoundTrack } from 'excalibur'

import { type CastSound, instantSound, isChannelEnd, removedActor } from './castAudioEvents'
import { footstepGain } from './footsteps'
import type { FootstepMap } from './mapSurfaces'
import type { WorldAmbienceSounds } from './worldAmbienceSounds'

export { isMagicCastAttack } from './castAudioEvents'

type TileSize = Pick<FootstepMap, 'tileWidth' | 'tileHeight'>
type Channel = { abilityId: AbilityId; startedAt: number; completesAt: number }

interface CastSource {
    gain: number
    distance: number
    channel: Channel | undefined
}

interface CastView {
    sources: Map<string, CastSource>
    localPlayerId: string
    receivedAt: number
    serverTime: number
}

interface Voice {
    track: SoundTrack
    channel?: Channel
}

interface CastAudioOptions {
    now?: () => number
    audioRunning?: () => boolean
}

const minimumChannelMs = 200
const instantReceiptMs = 10_000
const maximumReceipts = 512

/** Owns positional action cues for the current projected map and audio run. */
export class CastAudio {
    private readonly now: () => number
    private readonly audioRunning: () => boolean
    private readonly voices = new Map<string, Voice>()
    private readonly heard = new Map<string, number>()
    private readonly ended = new Map<string, number>()
    private view: CastView | undefined
    private locationId: string | undefined
    private lastSnapshotTime = -Infinity

    public constructor(
        private readonly sounds: Pick<WorldAmbienceSounds, 'request' | 'play'>,
        options: CastAudioOptions = {}
    ) {
        this.now = options.now ?? (() => performance.now())
        this.audioRunning =
            options.audioRunning ?? (() => AudioContextFactory.create().state === 'running')
    }

    public prepare(): void {
        this.sounds.request('magicCast')
        this.sounds.request('prayerWhisper')
    }

    public observeWorld(
        snapshot: WorldSnapshot,
        localPlayerId: string,
        tileSize: TileSize,
        isVisible: (id: string) => boolean
    ): void {
        if (snapshot.serverTime < this.lastSnapshotTime) return
        this.lastSnapshotTime = snapshot.serverTime
        const listener = snapshot.characters.find((actor) => actor.id === localPlayerId)
        const locationId = snapshot.location?.id
        if (locationId !== undefined) this.locationId = locationId
        if (!listener || !isAlive(listener) || locationId === undefined) {
            this.clear()
            return
        }
        this.view = {
            sources: readSources(snapshot, listener, tileSize, isVisible),
            localPlayerId,
            receivedAt: this.now(),
            serverTime: snapshot.serverTime,
        }
        for (const [key, expiresAt] of this.heard) {
            if (expiresAt <= snapshot.serverTime) this.heard.delete(key)
        }
        this.update()
    }

    public receive(event: GameEventPayload, serverTime: number): void {
        const view = this.view
        const locationId = this.locationId
        if (
            locationId === undefined ||
            !Number.isFinite(serverTime) ||
            (event.locationId !== undefined && event.locationId !== locationId)
        )
            return
        const removed = removedActor(event)
        if (removed) {
            this.end(removed, serverTime)
            this.stopVoice(removed)
            return
        }
        const { actorId, abilityId } = event
        if (actorId === undefined || abilityId === undefined) return
        if (isChannelEnd(event, abilityId)) {
            this.end(actorId, serverTime, abilityId)
            if (view) this.reconcileVoices(view, serverTime)
            return
        }
        const sound = instantSound(event)
        if (sound && view) this.playInstant(view, event, actorId, sound, serverTime)
    }

    public update(): void {
        const view = this.view
        if (!view) return
        if (!this.audioRunning()) {
            this.stopVoices()
            return
        }
        // Snapshot timestamps and terminal events share the server's gameplay clock in milliseconds.
        const serverTime = view.serverTime + (this.now() - view.receivedAt)
        this.reconcileVoices(view, serverTime)
        for (const [actorId, source] of view.sources) {
            this.playChannel(view, actorId, source, serverTime)
        }
    }

    /** Drops observations and live voices while preserving cast receipts on this map. */
    public clear(): void {
        this.view = undefined
        this.stopVoices()
    }

    public reset(): void {
        this.clear()
        this.locationId = undefined
        this.heard.clear()
        this.ended.clear()
        this.lastSnapshotTime = -Infinity
    }

    private playInstant(
        view: CastView,
        event: GameEventPayload,
        actorId: string,
        sound: CastSound,
        serverTime: number
    ): void {
        const identity = event.actionId ?? event.eventId ?? serverTime
        const receipt = JSON.stringify(['event', actorId, event.kind, event.abilityId, identity])
        if (this.heard.has(receipt)) return
        remember(this.heard, receipt, serverTime + instantReceiptMs)
        const source = view.sources.get(actorId)
        if (!source || this.actorGone(view, actorId) || !this.audioRunning()) return
        this.reconcileVoices(view, serverTime)
        if (!this.hasSlot(view, actorId)) return
        const track = this.sounds.play(sound, { volume: source.gain })
        if (track) this.voices.set(actorId, { track })
    }

    private playChannel(
        view: CastView,
        actorId: string,
        source: CastSource,
        serverTime: number
    ): void {
        const channel = source.channel
        if (!channel || channel.completesAt - serverTime < minimumChannelMs) return
        if (this.channelEnded(view, actorId, channel, serverTime) || !this.hasSlot(view, actorId))
            return
        const receipt = JSON.stringify(['channel', actorId, channel.abilityId, channel.startedAt])
        if (this.heard.has(receipt)) return
        const track = this.sounds.play(
            isPrayerAction(channel.abilityId) ? 'prayerWhisper' : 'magicCast',
            {
                volume: source.gain,
            }
        )
        if (!track) return
        remember(this.heard, receipt, channel.completesAt)
        this.voices.set(actorId, { track, channel })
    }

    private reconcileVoices(view: CastView, serverTime: number): void {
        for (const [actorId, voice] of this.voices) {
            const source = view.sources.get(actorId)
            if (!source || this.shouldStopVoice(view, actorId, source, voice, serverTime)) {
                this.stopVoice(actorId)
            } else if (voice.track.volume !== source.gain) {
                voice.track.volume = source.gain
            }
        }
    }

    private shouldStopVoice(
        view: CastView,
        actorId: string,
        source: CastSource,
        voice: Voice,
        serverTime: number
    ): boolean {
        if (voice.track.isStopped || this.actorGone(view, actorId)) return true
        const { channel } = voice
        return (
            channel !== undefined &&
            (!isSameChannel(source.channel, channel) ||
                this.channelEnded(view, actorId, channel, serverTime))
        )
    }

    private hasSlot(view: CastView, actorId: string): boolean {
        if (this.voices.has(actorId)) return false
        const remoteVoices = this.voices.size - Number(this.voices.has(view.localPlayerId))
        return actorId === view.localPlayerId || remoteVoices < 2
    }

    private channelEnded(
        view: CastView,
        actorId: string,
        channel: Channel,
        serverTime: number
    ): boolean {
        const terminal = Math.max(
            this.ended.get(terminalKey(actorId, channel.abilityId)) ?? -Infinity,
            this.ended.get(terminalKey(actorId)) ?? -Infinity
        )
        return (
            this.actorGone(view, actorId) ||
            channel.startedAt <= terminal ||
            channel.completesAt <= serverTime
        )
    }

    private actorGone(view: CastView, actorId: string): boolean {
        return view.serverTime <= (this.ended.get(terminalKey(actorId)) ?? -Infinity)
    }

    private end(actorId: string, serverTime: number, abilityId?: AbilityId): void {
        const key = terminalKey(actorId, abilityId)
        if (serverTime > (this.ended.get(key) ?? -Infinity)) remember(this.ended, key, serverTime)
    }

    private stopVoice(actorId: string): void {
        const voice = this.voices.get(actorId)
        if (voice && !voice.track.isStopped) voice.track.stop()
        this.voices.delete(actorId)
    }

    private stopVoices(): void {
        for (const actorId of this.voices.keys()) this.stopVoice(actorId)
    }
}

function isAlive(actor: CharacterSnapshot): boolean {
    return actor.alive && !actor.tags.includes('offline')
}

function readSources(
    snapshot: WorldSnapshot,
    listener: CharacterSnapshot,
    tileSize: TileSize,
    isVisible: (id: string) => boolean
): Map<string, CastSource> {
    const sources: [string, CastSource][] = []
    for (const actor of snapshot.characters) {
        if (!isAlive(actor) || !isVisible(actor.id)) continue
        const distance = Math.hypot(
            (actor.position.x - listener.position.x) / tileSize.tileWidth,
            (actor.position.y - listener.position.y) / tileSize.tileHeight
        )
        const gain = footstepGain(distance - 2, 6)
        if (gain > 0)
            sources.push([
                actor.id,
                { gain, distance, channel: readChannel(actor, snapshot.serverTime) },
            ])
    }
    return new Map(sources.sort((a, b) => a[1].distance - b[1].distance))
}

function readChannel(actor: CharacterSnapshot, serverTime: number): Channel | undefined {
    const channel = actor.abilities?.casting ?? actor.abilities?.magicChannel
    return channel && channel.startedAt <= serverTime && serverTime < channel.completesAt
        ? channel
        : undefined
}

function isSameChannel(current: Channel | undefined, playing: Channel): boolean {
    return current?.startedAt === playing.startedAt && current.abilityId === playing.abilityId
}

function terminalKey(actorId: string, abilityId?: AbilityId): string {
    return JSON.stringify([actorId, abilityId])
}

function remember(receipts: Map<string, number>, key: string, timestamp: number): void {
    receipts.delete(key)
    receipts.set(key, timestamp)
    if (receipts.size <= maximumReceipts) return
    const oldest = receipts.keys().next().value
    if (oldest !== undefined) receipts.delete(oldest)
}
