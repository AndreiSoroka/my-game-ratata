import type { CharacterSnapshot, Vector2 } from '@my-game-ratata/contracts'

import { clipMotion, motionLineClear, type MotionMap } from './motionCollision'
import type { RemotePlayerMotion } from './remotePlayerMotion'
import type { SnapshotReference } from './runtimeSnapshotStream'

export interface MotionTrack {
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
    remote?: RemotePlayerMotion
}

const continuationMs = 200
const correctionMs = 100

export function createTrack(
    snapshot: CharacterSnapshot,
    time: number,
    step: number,
    reference: SnapshotReference | undefined
): MotionTrack {
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
        correctionAt: time,
        correctionMs: 0,
        snapNext: false,
        reference,
    }
}

export function correctTrack(
    track: MotionTrack,
    previous: MotionTrack,
    now: number,
    map: MotionMap | undefined,
    compareAtPlaybackTime: boolean
): void {
    const desired = target(track, now, map)
    const origin = compareAtPlaybackTime ? renderTrack(previous, now, map) : previous.position
    const residual = { x: origin.x - desired.x, y: origin.y - desired.y }
    const tile = Math.max(map?.tileWidth ?? 16, map?.tileHeight ?? 16)
    const speed =
        Math.hypot(previous.velocity.x, previous.velocity.y) +
        Math.hypot(track.velocity.x, track.velocity.y)
    const threshold = Math.max(2 * tile, speed * 250 + tile / 2)
    if (Math.hypot(residual.x, residual.y) > threshold || !motionLineClear(map, origin, desired)) {
        track.position = desired
        return
    }
    track.correctionMs = Math.max(0, Math.min(correctionMs, track.until - now))
    if (track.correctionMs === 0) {
        track.position = desired
        return
    }
    track.correction = residual
    track.correctionAt = now
    track.position = { ...origin }
}

export function renderTrack(track: MotionTrack, now: number, map: MotionMap | undefined): Vector2 {
    const desired = target(track, now, map)
    const remaining =
        track.correctionMs > 0
            ? Math.max(0, 1 - (now - track.correctionAt) / track.correctionMs)
            : 0
    return clipPosition(
        track,
        {
            x: desired.x + track.correction.x * remaining,
            y: desired.y + track.correction.y * remaining,
        },
        map
    )
}

export function ordinaryWalk(track: MotionTrack): boolean {
    const actor = track.snapshot
    return (
        actor.animation.action === 'walk' &&
        actor.movement?.mode === 'walking' &&
        !forcedMotion(actor) &&
        (actor.control === undefined || actor.control.mode === 'none') &&
        actor.path.length === 0 &&
        track.until > track.time &&
        (track.velocity.x !== 0 || track.velocity.y !== 0)
    )
}

export function matchesMotionAxis({ velocity }: MotionTrack, axis: Readonly<Vector2>): boolean {
    const dot = axis.x * velocity.x + axis.y * velocity.y
    return dot > 0.99 * Math.hypot(axis.x, axis.y) * Math.hypot(velocity.x, velocity.y)
}

export function sameWalk(first: MotionTrack, second: MotionTrack): boolean {
    return (
        ordinaryWalk(first) &&
        ordinaryWalk(second) &&
        Math.hypot(first.velocity.x - second.velocity.x, first.velocity.y - second.velocity.y) <
            1e-4
    )
}

export function forcedMotion(character: CharacterSnapshot): boolean {
    return character.movement?.dashing === true || character.combat?.action?.abilityId === 'lunge'
}

export function discontinuous(previous: MotionTrack, character: CharacterSnapshot): boolean {
    return (
        previous.snapNext ||
        previous.snapshot.alive !== character.alive ||
        previous.snapshot.movement?.positionDiscontinuity !==
            character.movement?.positionDiscontinuity
    )
}

export function validStep(stepMs: number | undefined): stepMs is number {
    return stepMs !== undefined && Number.isFinite(stepMs) && stepMs >= 1 && stepMs <= 250
}

export function motionBlocked(character: CharacterSnapshot): boolean {
    return (
        !character.alive ||
        Boolean(character.life?.retired) ||
        character.tags.includes('offline') ||
        character.tags.includes('state.cc.stunned') ||
        character.cooldowns.stunMsLeft > 0 ||
        character.combat?.defensiveStance === true
    )
}

export function samePosition(first: Vector2, second: Vector2 | undefined): boolean {
    return second !== undefined && first.x === second.x && first.y === second.y
}

function target(track: MotionTrack, now: number, map: MotionMap | undefined): Vector2 {
    const age = Math.max(0, Math.min(now, track.until) - track.time)
    return clipPosition(
        track,
        {
            x: track.snapshot.position.x + track.velocity.x * age,
            y: track.snapshot.position.y + track.velocity.y * age,
        },
        map
    )
}

function clipPosition(track: MotionTrack, position: Vector2, map: MotionMap | undefined): Vector2 {
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
    return clipMotion(map, track.snapshot.position, {
        x: track.snapshot.position.x + dx,
        y: track.snapshot.position.y + dy,
    })
}
