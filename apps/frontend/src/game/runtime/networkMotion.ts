import {
    type CharacterSnapshot,
    type GameEventPayload,
    STOP_CORRECTION_BLEND_MS,
    STOP_CORRECTION_MAX_AGE_MS,
    type StopCorrectionRequest,
    type Vector2,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'

import { MotionClock } from './motionClock'
import type { MotionMap } from './motionCollision'
import {
    correctTrack,
    createTrack,
    discontinuous,
    forcedMotion,
    matchesMotionAxis,
    motionBlocked,
    type MotionTrack,
    ordinaryWalk,
    renderTrack,
    samePosition,
    sameWalk,
    validStep,
} from './motionTrack'
import { type MotionTiming, OwnerMotionLead } from './ownerMotionLead'
import { RemotePlayerMotion } from './remotePlayerMotion'
import type { SnapshotReference } from './runtimeSnapshotStream'

export type DrawnOwnerPose = SnapshotReference & { position: Vector2 }

type ManualStop = { actorId: string; from: Vector2 } & (
    | { phase: 'waiting'; requestId: number; deadline: number }
    | { phase: 'blending'; target: Vector2; startedAt: number }
)

/** All positions in this class are presentation state; authoritative snapshots stay untouched. */
export class NetworkMotion {
    private readonly clock = new MotionClock()
    private readonly ownerLead = new OwnerMotionLead()
    private readonly tracks = new Map<string, MotionTrack>()
    private held = false
    private map: MotionMap | undefined
    private stop: ManualStop | undefined
    private playerId: string | undefined
    private timing: MotionTiming | undefined
    private drawnOwner: DrawnOwnerPose | undefined

    public setTiming(timing: MotionTiming): void {
        this.timing = { ...timing, tickMs: validStep(timing.tickMs) ? timing.tickMs : 50 }
        this.ownerLead.reset()
    }

    public setMap(map: MotionMap): void {
        this.map = map
        this.reset()
    }

    public observe(
        snapshot: WorldSnapshot,
        localTime: number,
        playerId?: string,
        reference?: SnapshotReference
    ): void {
        if (!this.clock.observe(snapshot.serverTime, snapshot.tick, localTime) && !this.held) return
        const now = this.clock.now(localTime)
        const active = new Set(snapshot.characters.map((character) => character.id))
        if (this.playerId !== playerId || (playerId !== undefined && !active.has(playerId))) {
            this.drawnOwner = undefined
            this.ownerLead.reset()
        }
        this.playerId = playerId
        if (this.stop && (this.stop.actorId !== playerId || !active.has(this.stop.actorId)))
            this.cancelStop()
        for (const id of this.tracks.keys()) if (!active.has(id)) this.tracks.delete(id)
        for (const character of snapshot.characters)
            this.accept(character, snapshot, now, localTime, reference)
        this.held = false
    }

    public frame(localTime: number): void {
        if (this.held) return
        const now = this.clock.now(localTime)
        for (const track of this.tracks.values()) {
            if (track.snapNext) continue
            if (track.remote) {
                track.remote.frame(now, localTime, this.timing?.tickMs ?? 50, this.map)
                track.position = track.remote.position
            } else {
                const playback = this.playbackTime(track, now, localTime)
                if (!this.renderStop(track, localTime))
                    track.position = renderTrack(track, playback, this.map)
            }
        }
    }

    public recordDrawnOwner(position: Vector2 | undefined): void {
        const track = this.tracks.get(this.playerId ?? '')
        this.drawnOwner =
            position && track?.reference && !track.snapNext && !this.held
                ? { ...track.reference, position: { ...position } }
                : undefined
    }

    public lastDrawnOwnerPose(): DrawnOwnerPose | undefined {
        const drawn = this.drawnOwner
        return drawn && { ...drawn, position: { ...drawn.position } }
    }

    public beginStop(
        actorId: string,
        requestId: number,
        localTime: number
    ): StopCorrectionRequest | undefined {
        const track = this.tracks.get(actorId)
        const drawn = this.drawnOwner
        if (
            actorId !== this.playerId ||
            !track ||
            !drawn ||
            this.held ||
            track.snapNext ||
            motionBlocked(track.snapshot) ||
            forcedMotion(track.snapshot)
        )
            return undefined
        const from = { ...drawn.position }
        track.position = from
        this.stop = {
            actorId,
            from,
            phase: 'waiting',
            requestId,
            deadline: localTime + STOP_CORRECTION_MAX_AGE_MS,
        }
        return { id: requestId, ...drawn, position: { ...from } }
    }

    public cancelStop(): void {
        this.stop = undefined
    }

    public position(id: string): Vector2 | undefined {
        return this.tracks.get(id)?.position
    }

    public presentation(id: string, localTime: number): CharacterSnapshot | undefined {
        const track = this.tracks.get(id)
        if (!track) return undefined
        const snapshot = track.snapshot
        if (track.remote && !this.held && !track.snapNext)
            return track.remote.presentation(snapshot)
        const now = this.clock.now(localTime)
        const playback = id === this.playerId ? Math.max(now, this.ownerLead.time) : now
        const expired = this.held || this.stop?.actorId === id || playback >= track.until
        return expired && snapshot.animation.action === 'walk'
            ? { ...snapshot, animation: { ...snapshot.animation, action: 'idle' } }
            : snapshot
    }

    public serverTime(localTime: number): number {
        return this.clock.now(localTime)
    }

    public event(event: GameEventPayload): void {
        if (event.kind !== 'cast' || event.abilityId !== 'blink' || event.phase !== 'completed')
            return
        const track = this.tracks.get(event.actorId ?? '')
        if (!track || samePosition(track.snapshot.position, event.position)) return
        if (track.snapshot.id === this.playerId) {
            this.drawnOwner = undefined
            this.ownerLead.reset()
            this.cancelStop()
        }
        track.snapNext = true
        track.until = track.time
    }

    public hold(): void {
        this.cancelStop()
        this.drawnOwner = undefined
        this.ownerLead.reset()
        this.held = true
    }

    public reset(): void {
        this.tracks.clear()
        this.clock.reset()
        this.cancelStop()
        this.drawnOwner = undefined
        this.ownerLead.reset()
        this.held = false
    }

    private accept(
        character: CharacterSnapshot,
        frame: WorldSnapshot,
        now: number,
        localTime: number,
        reference: SnapshotReference | undefined
    ): void {
        const previous = this.tracks.get(character.id)
        const step = validStep(frame.stepMs) && !motionBlocked(character) ? frame.stepMs : 0
        const track = createTrack(character, frame.serverTime, step, reference)
        if (this.isRemotePlayer(character)) this.acceptRemote(track, previous, frame.stepMs)
        else this.acceptTrack(track, previous, step, now, localTime, frame.stopCorrection?.id)
        this.tracks.set(character.id, track)
    }

    private isRemotePlayer(character: CharacterSnapshot): boolean {
        return (
            this.playerId !== undefined &&
            character.id !== this.playerId &&
            character.controllerKind === 'network_player'
        )
    }

    private acceptRemote(
        track: MotionTrack,
        previous: MotionTrack | undefined,
        stepMs: number | undefined
    ): void {
        const { snapshot, time } = track
        if (!previous?.remote) {
            track.remote = new RemotePlayerMotion(snapshot, time)
            return
        }
        const snap =
            this.held ||
            !validStep(stepMs) ||
            discontinuous(previous, snapshot) ||
            !snapshot.alive ||
            forcedMotion(snapshot)
        track.remote = previous.remote
        track.remote.observe(snapshot, time, this.map, snap)
        track.position = track.remote.position
    }

    private acceptTrack(
        track: MotionTrack,
        previous: MotionTrack | undefined,
        step: number,
        now: number,
        localTime: number,
        receiptId: number | undefined
    ): void {
        const own = track.snapshot.id === this.playerId
        const snap = !previous || this.held || step === 0 || discontinuous(previous, track.snapshot)
        if (snap) {
            if (own) {
                this.drawnOwner = undefined
                this.ownerLead.reset()
                this.cancelStop()
            }
        } else if (!this.renderStop(track, localTime, receiptId)) {
            const playback = this.playbackTime(track, now, localTime)
            const aligned =
                playback > now && sameWalk(previous, track) && previous.until >= playback
            correctTrack(track, previous, playback, this.map, aligned)
        }
    }

    private playbackTime(track: MotionTrack, now: number, localTime: number): number {
        if (!this.timing || track.snapshot.id !== this.playerId) return now
        const axis = this.timing.manualAxis()
        const eligible = ordinaryWalk(track) && (axis.x !== 0 || axis.y !== 0)
        const estimate =
            eligible && matchesMotionAxis(track, axis)
                ? this.timing.estimateReceiptTime(localTime)
                : undefined
        return this.ownerLead.update(now, localTime, eligible, estimate)
    }

    private renderStop(track: MotionTrack, localTime: number, receiptId?: number): boolean {
        const stop = this.stop
        if (!stop || track.snapshot.id !== stop.actorId) return false
        if (stop.phase === 'waiting' && localTime < stop.deadline) {
            if (receiptId === stop.requestId)
                this.stop = {
                    actorId: stop.actorId,
                    from: stop.from,
                    phase: 'blending',
                    target: track.snapshot.position,
                    startedAt: localTime,
                }
            track.position = stop.from
            return true
        }
        if (stop.phase === 'blending' && samePosition(track.snapshot.position, stop.target)) {
            const progress = (localTime - stop.startedAt) / STOP_CORRECTION_BLEND_MS
            if (progress < 1) {
                track.position = {
                    x: stop.from.x + (stop.target.x - stop.from.x) * progress,
                    y: stop.from.y + (stop.target.y - stop.from.y) * progress,
                }
                return true
            }
        }
        this.cancelStop()
        track.position = { ...track.snapshot.position }
        track.until = track.time
        track.correctionMs = 0
        return true
    }
}
