import { randomInt } from 'node:crypto'

import type { WorldSnapshot } from '@my-game-ratata/contracts'

import type { RoomSocket } from './roomMessaging'

export type FullSnapshotReason = 'reset' | 'resync' | 'periodic' | 'size'

export interface SnapshotScope {
    playerId: string | undefined
    serverEpoch: string | undefined
    locationId: string | undefined
    clockResumeRevision: number
}

export interface SnapshotStream {
    streamId: number
    seq: number
    baseline: WorldSnapshot | undefined
    scope: SnapshotScope | undefined
    keyframeOffset: number
    keyframeAt: number
    pendingFull: FullSnapshotReason | undefined
    pendingResync: boolean
    resyncEligibleAt: number
    lastResyncAt: number
}

const streams = new WeakMap<RoomSocket, SnapshotStream>()
let lastStreamId = randomInt(2 ** 40)
const fullPriority: Record<FullSnapshotReason, number> = {
    reset: 4,
    resync: 3,
    periodic: 2,
    size: 1,
}

export function snapshotStream(socket: RoomSocket): SnapshotStream {
    let stream = streams.get(socket)
    if (stream === undefined) {
        stream = {
            streamId: 0,
            seq: -1,
            baseline: undefined,
            scope: undefined,
            keyframeOffset: socketPhase(socket),
            keyframeAt: 0,
            pendingFull: undefined,
            pendingResync: false,
            resyncEligibleAt: 0,
            lastResyncAt: Number.NEGATIVE_INFINITY,
        }
        streams.set(socket, stream)
    }
    return stream
}

export function clearSnapshotStream(socket: RoomSocket): void {
    streams.delete(socket)
}

/** An anchor from a previous connection cannot name a newly opened stream. */
export function nextSnapshotStreamId(): number {
    return ++lastStreamId
}

export function requestSnapshotResync(socket: RoomSocket, now: number): void {
    const stream = snapshotStream(socket)
    if (stream.pendingResync) {
        return
    }
    stream.pendingResync = true
    // A confirmed clock recovery must not wait for an obsolete future deadline.
    stream.resyncEligibleAt =
        now < stream.lastResyncAt
            ? now
            : Math.max(now, stream.lastResyncAt + 1000)
}

export function requireFullSnapshot(
    stream: SnapshotStream,
    reason: FullSnapshotReason
): void {
    if (
        stream.pendingFull === undefined ||
        fullPriority[reason] > fullPriority[stream.pendingFull]
    ) {
        stream.pendingFull = reason
    }
}

export function sameSnapshotScope(
    previous: SnapshotScope | undefined,
    next: SnapshotScope
): boolean {
    return (
        previous !== undefined &&
        previous.playerId === next.playerId &&
        previous.serverEpoch === next.serverEpoch &&
        previous.locationId === next.locationId &&
        previous.clockResumeRevision === next.clockResumeRevision
    )
}

export function keyframeInterval(streamId: number, offset: number): number {
    return 30_000 + (((Math.imul(streamId, 2654435761) >>> 0) + offset) % 5001)
}

function socketPhase(socket: RoomSocket): number {
    const id = (socket as Partial<RoomSocket>).data?.socketId ?? ''
    let hash = 0
    for (let index = 0; index < id.length; index += 1) {
        hash = (hash * 31 + id.charCodeAt(index)) >>> 0
    }
    return hash % 5001
}
