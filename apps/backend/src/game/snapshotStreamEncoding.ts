import type {
    SnapshotServerMessage,
    WorldInitServerMessage,
    WorldSnapshot,
} from '@my-game-ratata/contracts'

export interface NormalizedSnapshot {
    snapshot: WorldSnapshot
    json: string
}

/** Detach the exact JSON wire image, including omission of undefined properties. */
export function prepareSnapshot(
    snapshot: WorldSnapshot,
    stepMs: number
): NormalizedSnapshot {
    const json = JSON.stringify({ ...snapshot, stepMs: validStepMs(stepMs) })
    return { snapshot: JSON.parse(json) as WorldSnapshot, json }
}

export function validStepMs(stepMs: number): number {
    return Number.isFinite(stepMs) && stepMs >= 1 && stepMs <= 250 ? stepMs : 0
}

export function encodeFullSnapshot(
    normalized: NormalizedSnapshot,
    streamId: number,
    seq: number
): string {
    const envelope: Omit<SnapshotServerMessage, 'snapshot'> = {
        type: 'snapshot',
        streamId,
        seq,
    }
    return encodeSnapshotEnvelope(envelope, normalized.json)
}

export function encodeWorldInit(
    message: Omit<WorldInitServerMessage, 'streamId' | 'seq'>,
    normalized: NormalizedSnapshot,
    streamId: number
): string {
    const envelope: Omit<WorldInitServerMessage, 'snapshot'> = {
        type: 'world_init',
        protocolVersion: message.protocolVersion,
        map: message.map,
        playerId: message.playerId,
        tickMs: message.tickMs,
        streamId,
        seq: 0,
    }
    return encodeSnapshotEnvelope(envelope, normalized.json)
}

function encodeSnapshotEnvelope(
    envelope: object,
    snapshotJson: string
): string {
    return `${JSON.stringify(envelope).slice(0, -1)},"snapshot":${snapshotJson}}`
}
