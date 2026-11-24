import type { Vector2 } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { movementInputLocked } from './combatMovement'
import { normalize, zeroVector } from './math'

export interface TimedMovementSegment {
    axis: Vector2
    startedAt: number
    endsAt: number
}

export interface TimedMovementInput {
    segments: TimedMovementSegment[]
    finalAxis: Vector2
    stoppedAt?: number
}

interface InputChange {
    at: number
    axis: Vector2
}

interface InputHistory {
    locationId: string
    lifeStartedAt: number
    deathSequence: number
    baseline: Vector2
    changes: InputChange[]
    overflow: boolean
}

const histories = new WeakMap<GameCharacter, InputHistory>()
const maxChanges = 128

export function resolveMovementInput(
    actor: GameCharacter,
    before: Vector2,
    axis: Vector2,
    receivedAt?: number
): Vector2 {
    if (movementInputLocked(actor)) {
        clearMovementInputHistory(actor)
        return zeroVector()
    }
    const next = normalize(axis)
    recordMovementInput(actor, before, next, receivedAt)
    if (next.x !== 0 || next.y !== 0) {
        actor.clearPath()
    }
    return next
}

/** Only trusted server receipt times enter this transient journal. */
export function recordMovementInput(
    actor: GameCharacter,
    before: Vector2,
    axis: Vector2,
    receivedAt?: number
): void {
    if (receivedAt === undefined || !Number.isFinite(receivedAt)) {
        clearMovementInputHistory(actor)
        return
    }
    let history = histories.get(actor)
    if (history !== undefined && !sameScope(history, actor)) {
        clearMovementInputHistory(actor)
        history = undefined
    }
    if (sameAxis(before, axis)) {
        return
    }
    history ??= createHistory(actor, before)
    histories.set(actor, history)
    appendChange(history, axis, receivedAt)
}

export function clearMovementInputHistory(actor: GameCharacter): void {
    histories.delete(actor)
}

/** Drain once, clipping receipts to the movement time allocated by the room loop. */
export function consumeMovementInputHistory(
    actor: GameCharacter,
    now: number,
    deltaMs: number
): TimedMovementInput | undefined {
    const history = histories.get(actor)
    if (history === undefined) {
        return undefined
    }
    if (!sameScope(history, actor)) {
        clearMovementInputHistory(actor)
        return undefined
    }
    const start = now - Math.max(0, Math.min(250, deltaMs))
    const consumed = history.changes.filter((change) => change.at <= now)
    const pending = history.changes.filter((change) => change.at > now)
    const finalAxis = consumed.at(-1)?.axis ?? history.baseline
    const segments = history.overflow
        ? []
        : segmentsFor(history, consumed, start, now)
    const result: TimedMovementInput = { segments, finalAxis: { ...finalAxis } }
    const stop = consumed.at(-1)
    if (stop !== undefined && isZero(finalAxis)) {
        result.stoppedAt = Math.max(start, Math.min(now, stop.at))
    }
    retainPending(actor, history, pending, finalAxis)
    return result
}

function createHistory(actor: GameCharacter, before: Vector2): InputHistory {
    return {
        locationId: actor.locationId,
        lifeStartedAt: actor.lifeStartedAt,
        deathSequence: actor.deathSequence,
        baseline: { ...before },
        changes: [],
        overflow: false,
    }
}

function appendChange(
    history: InputHistory,
    axis: Vector2,
    receivedAt: number
): void {
    const previous = history.changes.at(-1)
    const at = Math.max(receivedAt, previous?.at ?? receivedAt)
    const change = { at, axis: { ...axis } }
    if (history.overflow) {
        history.changes = [change]
    } else if (previous?.at === at) {
        history.changes[history.changes.length - 1] = change
    } else if (history.changes.length >= maxChanges) {
        history.overflow = true
        history.changes = [change]
    } else {
        history.changes.push(change)
    }
}

function segmentsFor(
    history: InputHistory,
    changes: InputChange[],
    start: number,
    end: number
): TimedMovementSegment[] {
    const segments: TimedMovementSegment[] = []
    let axis = history.baseline
    let cursor = start
    for (const change of changes) {
        const at = Math.max(start, Math.min(end, change.at))
        if (at > cursor) {
            segments.push({ axis: { ...axis }, startedAt: cursor, endsAt: at })
        }
        axis = change.axis
        cursor = at
    }
    if (cursor < end) {
        segments.push({ axis: { ...axis }, startedAt: cursor, endsAt: end })
    }
    return segments
}

function retainPending(
    actor: GameCharacter,
    history: InputHistory,
    pending: InputChange[],
    finalAxis: Vector2
): void {
    if (pending.length === 0) {
        clearMovementInputHistory(actor)
        return
    }
    history.baseline = { ...finalAxis }
    history.changes = pending
    history.overflow = false
}

function sameScope(history: InputHistory, actor: GameCharacter): boolean {
    return (
        history.locationId === actor.locationId &&
        history.lifeStartedAt === actor.lifeStartedAt &&
        history.deathSequence === actor.deathSequence
    )
}

function sameAxis(first: Vector2, second: Vector2): boolean {
    return first.x === second.x && first.y === second.y
}

function isZero(axis: Vector2): boolean {
    return axis.x === 0 && axis.y === 0
}
