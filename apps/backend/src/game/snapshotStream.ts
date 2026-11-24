import {
    diffSnapshots,
    type SnapshotDeltaServerMessage,
    SnapshotPatchError,
    type WorldInitServerMessage,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'

import type { RoomSocket } from './roomMessaging'
import {
    encodeFullSnapshot,
    encodeWorldInit,
    type NormalizedSnapshot,
    prepareSnapshot,
} from './snapshotStreamEncoding'
import {
    clearSnapshotStream,
    keyframeInterval,
    nextSnapshotStreamId,
    requireFullSnapshot,
    sameSnapshotScope,
    type SnapshotScope,
    type SnapshotStream,
    snapshotStream,
} from './snapshotStreamState'

export interface SnapshotSendOptions {
    playerId?: string
    clockResumeRevision?: number
    stepMs?: number
    deltas?: boolean
    onSent?: (
        reference: { streamId: number; seq: number },
        serverTime: number
    ) => void
}

export function sendWorldInit(
    socket: RoomSocket,
    message: Omit<WorldInitServerMessage, 'streamId' | 'seq'>,
    options: SnapshotSendOptions = {}
): boolean {
    const stream = snapshotStream(socket)
    const normalized = prepareSnapshot(message.snapshot, 0)
    const scope = snapshotScope(normalized.snapshot, {
        ...options,
        playerId: message.playerId,
    })
    const streamId = nextSnapshotStreamId()
    const payload = encodeWorldInit(message, normalized, streamId)
    if (!sendState(socket, payload, false)) {
        return false
    }
    commitFrame(stream, normalized.snapshot, scope, streamId, 0, true)
    options.onSent?.({ streamId, seq: 0 }, normalized.snapshot.serverTime)
    return true
}

/** A skipped or dropped frame never becomes the base of a future delta. */
export function sendSnapshot(
    socket: RoomSocket,
    build: () => WorldSnapshot,
    options: SnapshotSendOptions = {}
): void {
    const transport: Partial<RoomSocket> = socket
    if ((transport.getBufferedAmount?.() ?? 0) > 0) {
        return
    }
    const raw = build()
    const normalized = prepareSnapshot(raw, options.stepMs ?? raw.stepMs ?? 0)
    const stream = snapshotStream(socket)
    const scope = snapshotScope(normalized.snapshot, options)
    prepareFullReason(stream, scope, normalized.snapshot.serverTime)
    const reset = stream.pendingFull === 'reset'
    const streamId = reset ? nextSnapshotStreamId() : stream.streamId
    const seq = reset ? 0 : stream.seq + 1
    const full = encodeFullSnapshot(normalized, streamId, seq)
    const payload = chooseFrame(
        stream,
        normalized,
        full,
        streamId,
        seq,
        options
    )
    if (!sendState(socket, payload)) {
        return
    }
    commitFrame(
        stream,
        normalized.snapshot,
        scope,
        streamId,
        seq,
        payload === full
    )
    options.onSent?.({ streamId, seq }, normalized.snapshot.serverTime)
}

function snapshotScope(
    snapshot: WorldSnapshot,
    options: SnapshotSendOptions
): SnapshotScope {
    return {
        playerId: options.playerId,
        serverEpoch: snapshot.serverEpoch,
        locationId: snapshot.location?.id,
        clockResumeRevision: options.clockResumeRevision ?? 0,
    }
}

function prepareFullReason(
    stream: SnapshotStream,
    scope: SnapshotScope,
    now: number
): void {
    if (
        stream.baseline === undefined ||
        !sameSnapshotScope(stream.scope, scope)
    ) {
        requireFullSnapshot(stream, 'reset')
    }
    if (now >= stream.keyframeAt) {
        requireFullSnapshot(stream, 'periodic')
    }
    if (stream.pendingResync && now >= stream.resyncEligibleAt) {
        requireFullSnapshot(stream, 'resync')
    }
}

function chooseFrame(
    stream: SnapshotStream,
    normalized: NormalizedSnapshot,
    full: string,
    streamId: number,
    seq: number,
    options: SnapshotSendOptions
): string {
    if (
        stream.pendingFull !== undefined ||
        stream.baseline === undefined ||
        !deltasEnabled(options)
    ) {
        return full
    }
    try {
        const patch = diffSnapshots(stream.baseline, normalized.snapshot)
        const message: SnapshotDeltaServerMessage = {
            type: 'snapshot_delta',
            streamId,
            baseSeq: stream.seq,
            seq,
            tick: normalized.snapshot.tick,
            serverTime: normalized.snapshot.serverTime,
            stepMs: normalized.snapshot.stepMs ?? 0,
            ...(patch === undefined ? {} : { patch }),
        }
        const delta = JSON.stringify(message)
        if (Buffer.byteLength(delta) < Buffer.byteLength(full)) {
            return delta
        }
    } catch (error) {
        if (!(error instanceof SnapshotPatchError)) {
            throw error
        }
    }
    requireFullSnapshot(stream, 'size')
    return full
}

function deltasEnabled(options: SnapshotSendOptions): boolean {
    return options.deltas ?? process.env['GAME_SNAPSHOT_DELTAS'] !== '0'
}

function commitFrame(
    stream: SnapshotStream,
    snapshot: WorldSnapshot,
    scope: SnapshotScope,
    streamId: number,
    seq: number,
    full: boolean
): void {
    stream.baseline = snapshot
    stream.scope = scope
    stream.streamId = streamId
    stream.seq = seq
    if (!full) {
        return
    }
    stream.keyframeAt =
        snapshot.serverTime + keyframeInterval(streamId, stream.keyframeOffset)
    stream.pendingFull = undefined
    if (stream.pendingResync) {
        stream.lastResyncAt = snapshot.serverTime
    }
    stream.pendingResync = false
}

function sendState(
    socket: RoomSocket,
    payload: string,
    closeOnFailure = true
): boolean {
    try {
        const result = socket.send(payload, true)
        return result > 0 || result === -1
    } catch {
        if (closeOnFailure) {
            closeSnapshotSocket(socket)
        }
        return false
    }
}

export function closeSnapshotSocket(socket: RoomSocket): void {
    clearSnapshotStream(socket)
    const transport: Partial<RoomSocket> = socket
    try {
        transport.close?.(1011, 'Snapshot stream unavailable')
    } catch {
        /* Already closed. */
    }
}
