import { applySnapshotObject } from './snapshotApply'
import { diffSnapshotObject } from './snapshotDiff'
import { isSnapshotObject } from './snapshotJson'
import {
    type SnapshotFrameMeta,
    type SnapshotJson,
    type SnapshotPatch,
    SnapshotPatchError,
} from './snapshotPatchTypes'
import type { WorldSnapshot } from './worldSnapshot'

export { SnapshotPatchError } from './snapshotPatchTypes'

/** Detach live server references and use precisely the existing JSON wire semantics. */
export function normalizeSnapshot(snapshot: WorldSnapshot): WorldSnapshot {
    const value: unknown = JSON.parse(JSON.stringify(snapshot))
    if (!isSnapshotObject(value)) {
        throw new SnapshotPatchError('Snapshot must be a JSON object')
    }
    return value as unknown as WorldSnapshot
}

/** Inputs are normalized snapshots. Time travels in the frame header, never in a patch. */
export function diffSnapshots(
    previous: WorldSnapshot,
    next: WorldSnapshot
): SnapshotPatch | undefined {
    return diffSnapshotObject(
        previous as unknown as Record<string, SnapshotJson>,
        next as unknown as Record<string, SnapshotJson>,
        true
    )
}

export function applySnapshotPatch(
    previous: WorldSnapshot,
    patch: SnapshotPatch | undefined,
    meta: SnapshotFrameMeta
): WorldSnapshot {
    validateMetadata(meta)
    const next =
        patch === undefined
            ? previous
            : applySnapshotObject(
                  previous as unknown as Record<string, SnapshotJson>,
                  patch,
                  true
              )
    return {
        ...next,
        tick: meta.tick,
        serverTime: meta.serverTime,
        stepMs: meta.stepMs,
    } as WorldSnapshot
}

/** Development/test guard; shared frozen branches are not traversed again. */
export function freezeSnapshot(snapshot: WorldSnapshot): WorldSnapshot {
    freezeValue(snapshot as unknown as SnapshotJson)
    return snapshot
}

function freezeValue(value: SnapshotJson): void {
    if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
        return
    }
    for (const child of Object.values(value)) {
        freezeValue(child)
    }
    Object.freeze(value)
}

function validateMetadata(meta: SnapshotFrameMeta): void {
    if (
        !Number.isSafeInteger(meta.tick) ||
        meta.tick < 0 ||
        !Number.isFinite(meta.serverTime) ||
        meta.serverTime < 0 ||
        !Number.isFinite(meta.stepMs) ||
        (meta.stepMs !== 0 && (meta.stepMs < 1 || meta.stepMs > 250))
    ) {
        throw new SnapshotPatchError('Invalid snapshot frame metadata')
    }
}
