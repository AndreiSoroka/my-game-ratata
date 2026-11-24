import type {
    CharacterSnapshot,
    GameEventPayload,
    Vector2,
    WorldSnapshot,
} from '@my-game-ratata/contracts'

import { MotionClock } from './motionClock'
import { clipMotion, motionLineClear, type MotionMap } from './motionCollision'

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
}

const continuationMs = 200
const correctionMs = 100

/** All positions in this class are presentation state; authoritative snapshots stay untouched. */
export class NetworkMotion {
    private readonly clock = new MotionClock()
    private readonly tracks = new Map<string, Track>()
    private held = false
    private map: MotionMap | undefined

    public setMap(map: MotionMap): void {
        this.map = map
        this.reset()
    }

    public observe(snapshot: WorldSnapshot, localTime: number): void {
        if (!this.clock.observe(snapshot.serverTime, snapshot.tick, localTime)) return
        const now = this.clock.now(localTime)
        const active = new Set(snapshot.characters.map((character) => character.id))
        for (const id of this.tracks.keys()) if (!active.has(id)) this.tracks.delete(id)
        for (const character of snapshot.characters) this.accept(character, snapshot, now)
        this.held = false
    }

    public frame(localTime: number): void {
        if (this.held) return
        const now = this.clock.now(localTime)
        for (const track of this.tracks.values()) if (!track.snapNext) this.render(track, now)
    }

    public position(id: string): Vector2 | undefined {
        return this.tracks.get(id)?.position
    }

    public presentation(id: string, localTime: number): CharacterSnapshot | undefined {
        const track = this.tracks.get(id)
        if (!track) return undefined
        const snapshot = track.snapshot
        const expired = this.held || this.clock.now(localTime) >= track.until
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
        track.snapNext = true
        track.until = track.time
    }

    public hold(): void {
        this.held = true
    }

    public reset(): void {
        this.tracks.clear()
        this.clock.reset()
        this.held = false
    }

    private accept(character: CharacterSnapshot, frame: WorldSnapshot, now: number): void {
        const previous = this.tracks.get(character.id)
        const velocity = motionVelocity(character, frame.stepMs)
        const until = Math.max(
            frame.serverTime,
            Math.min(
                frame.serverTime + continuationMs,
                character.movement?.continuationUntil ?? Infinity
            )
        )
        const track: Track = {
            snapshot: character,
            velocity,
            position: { ...character.position },
            time: frame.serverTime,
            until: validStep(frame.stepMs) && !motionBlocked(character) ? until : frame.serverTime,
            correction: { x: 0, y: 0 },
            correctionAt: now,
            correctionMs: 0,
            snapNext: false,
        }
        const snap =
            !previous ||
            this.held ||
            previous.snapNext ||
            previous.snapshot.alive !== character.alive ||
            motionBlocked(character) ||
            !validStep(frame.stepMs)
        if (!snap) this.correct(track, previous, now)
        this.tracks.set(character.id, track)
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

function motionVelocity(character: CharacterSnapshot, stepMs: number | undefined): Vector2 {
    if (!validStep(stepMs) || motionBlocked(character)) return { x: 0, y: 0 }
    return { x: character.velocity.x / stepMs, y: character.velocity.y / stepMs }
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
