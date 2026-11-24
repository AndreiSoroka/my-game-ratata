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
import { clipMotion, motionLineClear, type MotionMap } from './motionCollision'
import type { SnapshotReference } from './runtimeSnapshotStream'

interface Track {
    snapshot: CharacterSnapshot
    velocity: Vector2
    position: Vector2
    time: number
    until: number
    correction: Vector2
    correctionAt: number
    correctionMs: number
    snapNext: boolean
    reference: SnapshotReference | undefined
}

type ManualStop = { actorId: string; from: Vector2 } & (
    | { phase: 'waiting'; requestId: number; deadline: number }
    | { phase: 'blending'; target: Vector2; startedAt: number }
)

const continuationMs = 200
const correctionMs = 100

/** All positions in this class are presentation state; authoritative snapshots stay untouched. */
export class NetworkMotion {
    private readonly clock = new MotionClock()
    private readonly tracks = new Map<string, Track>()
    private held = false
    private map: MotionMap | undefined
    private stop: ManualStop | undefined

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
            if (!track.snapNext && !this.renderStop(track, localTime)) this.render(track, now)
        }
    }

    public beginStop(
        actorId: string,
        requestId: number,
        localTime: number
    ): StopCorrectionRequest | undefined {
        const track = this.tracks.get(actorId)
        if (
            !track?.reference ||
            this.held ||
            track.snapNext ||
            motionBlocked(track.snapshot) ||
            track.snapshot.movement?.dashing ||
            track.snapshot.combat?.action?.abilityId === 'lunge'
        )
            return undefined
        const from = { ...track.position }
        this.stop = {
            actorId,
            from,
            phase: 'waiting',
            requestId,
            deadline: localTime + STOP_CORRECTION_MAX_AGE_MS,
        }
        return { id: requestId, ...track.reference, position: { ...from } }
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
        const expired =
            this.held || this.stop?.actorId === id || this.clock.now(localTime) >= track.until
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
        if (this.stop?.actorId === event.actorId) this.cancelStop()
        track.snapNext = true
        track.until = track.time
    }

    public hold(): void {
        this.cancelStop()
        this.held = true
    }

    public reset(): void {
        this.tracks.clear()
        this.clock.reset()
        this.cancelStop()
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
        const track = createTrack(character, frame.serverTime, step, now, reference)
        const snap = !previous || this.held || step === 0 || discontinuous(previous, character)
        if (snap) {
            if (this.stop?.actorId === character.id) this.cancelStop()
        } else if (!this.renderStop(track, localTime, frame.stopCorrection?.id)) {
            this.correct(track, previous, now)
        }
        this.tracks.set(character.id, track)
    }

    private renderStop(track: Track, localTime: number, receiptId?: number): boolean {
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

    private correct(track: Track, previous: Track, now: number): void {
        const desired = this.target(track, now)
        const residual = {
            x: previous.position.x - desired.x,
            y: previous.position.y - desired.y,
        }
        const tile = Math.max(this.map?.tileWidth ?? 16, this.map?.tileHeight ?? 16)
        const speed =
            Math.hypot(previous.velocity.x, previous.velocity.y) +
            Math.hypot(track.velocity.x, track.velocity.y)
        const threshold = Math.max(2 * tile, speed * 250 + tile / 2)
        if (
            Math.hypot(residual.x, residual.y) > threshold ||
            !motionLineClear(this.map, previous.position, desired)
        ) {
            track.position = desired
            return
        }
        track.correctionMs = Math.max(0, Math.min(correctionMs, track.until - now))
        if (track.correctionMs === 0) {
            track.position = desired
            return
        }
        track.correction = residual
        track.position = { ...previous.position }
    }

    private render(track: Track, now: number): void {
        const target = this.target(track, now)
        const remaining =
            track.correctionMs > 0
                ? Math.max(0, 1 - (now - track.correctionAt) / track.correctionMs)
                : 0
        track.position = this.clipPosition(track, {
            x: target.x + track.correction.x * remaining,
            y: target.y + track.correction.y * remaining,
        })
    }

    private target(track: Track, now: number): Vector2 {
        const age = Math.max(0, Math.min(now, track.until) - track.time)
        return this.clipPosition(track, {
            x: track.snapshot.position.x + track.velocity.x * age,
            y: track.snapshot.position.y + track.velocity.y * age,
        })
    }

    private clipPosition(track: Track, position: Vector2): Vector2 {
        let dx = position.x - track.snapshot.position.x
        let dy = position.y - track.snapshot.position.y
        const point = track.snapshot.path[0]
        const maximum = point
            ? Math.hypot(point.x - track.snapshot.position.x, point.y - track.snapshot.position.y)
            : Infinity
        const distance = Math.hypot(dx, dy)
        if (distance > maximum && distance > 0) {
            dx *= maximum / distance
            dy *= maximum / distance
        }
        return clipMotion(this.map, track.snapshot.position, {
            x: track.snapshot.position.x + dx,
            y: track.snapshot.position.y + dy,
        })
    }
}

function createTrack(
    snapshot: CharacterSnapshot,
    time: number,
    step: number,
    now: number,
    reference: SnapshotReference | undefined
): Track {
    const deadline = snapshot.movement?.continuationUntil ?? Infinity
    return {
        snapshot,
        velocity: step
            ? { x: snapshot.velocity.x / step, y: snapshot.velocity.y / step }
            : { x: 0, y: 0 },
        position: { ...snapshot.position },
        time,
        until: step ? Math.max(time, Math.min(time + continuationMs, deadline)) : time,
        correction: { x: 0, y: 0 },
        correctionAt: now,
        correctionMs: 0,
        snapNext: false,
        reference,
    }
}

function discontinuous(previous: Track, character: CharacterSnapshot): boolean {
    return (
        previous.snapNext ||
        previous.snapshot.alive !== character.alive ||
        previous.snapshot.movement?.positionDiscontinuity !==
            character.movement?.positionDiscontinuity
    )
}

function validStep(stepMs: number | undefined): stepMs is number {
    return stepMs !== undefined && Number.isFinite(stepMs) && stepMs >= 1 && stepMs <= 250
}

function motionBlocked(character: CharacterSnapshot): boolean {
    return (
        !character.alive ||
        Boolean(character.life?.retired) ||
        character.tags.includes('offline') ||
        character.tags.includes('state.cc.stunned') ||
        character.cooldowns.stunMsLeft > 0 ||
        character.combat?.defensiveStance === true
    )
}

function samePosition(first: Vector2, second: Vector2 | undefined): boolean {
    return second !== undefined && first.x === second.x && first.y === second.y
}
